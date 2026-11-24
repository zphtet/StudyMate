# Implementation Plan: Installable PWA and Offline Use

**Branch**: `008-pwa-offline` (work on `main`, as for 001–007) | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-pwa-offline/spec.md`, clarified on 2026-11-24 with five answers:
- offline drafts keep text and photos;
- the server wins a conflict and the student is told;
- sign-out warns, then wipes the device;
- Submit is queued with the press time;
- only single-shift edits are queued; rotation is disabled offline.

## Summary

StudyMate becomes installable on Android, iOS and desktop. It keeps working on a train with no signal: courses a student opened stay readable, and their study writes wait in a queue until the phone is back online.

006 left a push-only `public/sw.js` and a bare manifest. 008 adds:
- **A Serwist worker** built by `@serwist/turbopack` at `/serwist/sw.js`, scope `/` (R1). It precaches the shell and `/~offline`, NetworkFirst for pages and RSC, and CacheFirst for lesson files and submission images by their stable same-origin URLs (R2). 006's push and `notificationclick` handlers move into it unchanged.
- **Courses kept offline**: opening a course online stores its lesson data, pages and up to 20 MB of media, evicting the least recently opened course when storage runs low (R3).
- **A persisted query cache** per user in IndexedDB (Dexie), so every screen renders from cache first (R4).
- **An outbox** (Dexie) with one pending entry per record. It covers complete/undo, drafts with photos, Submit, focus sessions and single-shift edits, and is replayed in order through **`POST /api/sync`** (R5, R6). Each op is idempotent through `client_op_id` and applied only if the record is unchanged since the student saw it; otherwise it is dropped and shown in a "Not saved" sheet (R7). Device times are accepted within a bounded window (R8). Photos are kept as Blobs and uploaded before their draft (R9).
- **Global UI**:
  - the offline banner;
  - "Will sync" pills;
  - "Needs a connection" on everything else (R14);
  - the install sheet (Chromium prompt, or iOS steps; 2nd visit; 14-day dismissal) (R12);
  - "Update ready — Reload" (R13);
  - the sign-out warning and wipe (R10, R11).
- **Two small columns**: `submissions.client_op_id` and `shifts.updated_at`. No RLS change.
- **Security headers**: CSP, HSTS and friends (R15).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies** (new, pinned at install):
- `serwist` + `@serwist/turbopack` (+ `esbuild`, dev): worker build and runtime (R1).
- `dexie` 4: outbox, photos, persisted queries, kept courses (R4, R5).
- `@tanstack/react-query-persist-client` 5: `PersistQueryClientProvider` with a Dexie persister (R4).
- `fake-indexeddb` (dev): Vitest for Dexie code.

Existing: TanStack Query 5, next-intl, Zod 4, Sonner, shadcn/ui, supabase-js (Storage uploads), 004's `lib/image.ts` and `upload.ts`.

**Storage**:
- Server: `submissions.client_op_id` (new, unique), `shifts.updated_at` (new). Already in place: `lesson_progress.client_op_id`, `study_sessions.client_op_id` and `shifts.client_op_id`, now written.
- Device: IndexedDB `studymate` (`outbox`, `outboxFiles`, `queryCache`, `offlineCourses`); Cache Storage (precache, `pages`, `pages-rsc*`, `media`); `localStorage` for install visits and dismissal.

**Testing**:
- Vitest (written first):
  - `lib/offline` outbox (coalescing, ordering, rebase, states), `acceptedTime`, eviction choice, the persister and install-visit logic, with `fake-indexeddb`;
  - `features/progress/sync-ops` and `features/shifts/sync-ops` against the dev DB, one test per R7 row;
  - `/api/sync` guard (401, 403, cross-student).
- pgTAP: `008_offline_versions` (columns, uniqueness, policies unchanged).
- Playwright on a production build on :3100 (the worker is off in dev):
  - `us1-install` (manifest, `Page.getInstallabilityErrors`, prompt on the 2nd visit, 14-day dismissal, iOS sheet);
  - `us2-offline` (`context.setOffline`: read, complete, draft with a photo, submit, shift; sync with original times; one conflict; sign-out wipe);
  - `us3-update` (waiting worker → toast; draft kept).

  390×844 and 1280×800, with axe.

**Target Platform**: Android Chrome, iOS Safari 16.4+ (installed, for push), desktop Chrome/Edge/Safari/Firefox (Firefox: offline yes, install prompt no). Hosted on Vercel, HTTPS only.

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- SC-001: Lighthouse performance ≥ 90 on `/s/today` (mobile); installable with no manifest errors.
- SC-002: installed cold start to a usable Today < 2 s on a mid-range Android with cache. The shell comes from the precache; data from the persisted cache restored before first render.
- SC-003: 100 % of queued ops in the e2e suite end `applied`, or `dropped` exactly where the scenario expects it.
- Warming a course runs at idle, one request at a time, and never delays the course page.

**Constraints**:
- `cacheComponents: true`: no nonce CSP (R15). The Serwist route must build under it (R1 spike).
- Server Action ids change per build, so replay uses a stable Route Handler (R6).
- Signed Storage URLs expire after 1 h, so media are cached by their stable `/api/...` URL in CORS mode, never opaque (R2).
- iOS: no `beforeinstallprompt`, no Background Sync, and storage may be evicted under pressure. `persist()` is requested after install; the outbox syncs while the app is open.
- 20 MB of media per kept course; LRU eviction at 80 % of quota.
- Times: user-facing instants accept the device's time only within [now − 14 d, now + 2 min] (R8); versions are server time.

**Scale/Scope**:
- 8 op types across 2 features.
- 5 global UI pieces, 1 new page (`/~offline`), offline behaviour on about 12 existing screens.
- 1 Route Handler; 1 migration with 2 columns.
- About 35 new strings × 3 languages.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 008 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. `/api/sync` calls `requireRole('student')`; each op runs its Server Action's per-record guard (`requireLessonReader`) and scopes every `where` to `studentId: me.id`. Admins have no queued writes. RLS is unchanged on both altered tables, and pgTAP re-asserts it. Device data is per user and wiped on sign-out. | ✅ | ✅ |
| II. Spec first | 5 clarifications recorded in the spec. FR-002 states behaviour (last saved copy at once, refreshed online); this plan meets it for lesson data with the persisted query cache (R2). No screenshots exist for 008's pieces; they reuse existing components (contracts/ui-routes.md). | ✅ | ✅ |
| III. Test-first | Outbox, accepted-time, eviction and install logic are unit-tested before the code. sync-ops are tested per R7 row against the DB before the route. pgTAP before the migration. One Playwright spec per user story. | ✅ | ✅ |
| IV. Time | All stored instants are UTC `timestamptz`. The device time is accepted only for user-facing instants and bounded (R8). Overnight shifts stay one record: offline `shift.save` uses 005's `saveShiftSchema` and `instantsOf` unchanged. | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | Banner, sheets and pills designed at 390 px, tokens only, ≥ 44 px targets, live region for the banner, `aria-describedby` reasons on disabled controls, safe-area insets in standalone (R12). | ✅ | ✅ |
| VI. Three languages | `pwa.*` and the new `errors.*` codes in en/my/ja; `/~offline` is translated too. Lesson content stays untranslated. | ✅ | ✅ |
| VII. Stack (2.1.0) | `@serwist/turbopack` + `app/manifest.ts` + Dexie, as named. Prisma for all table access. supabase-js only for the offline photos' Storage upload. TanStack Query for reads (now persisted). Online writes stay `useMutation` + Server Actions; queued writes replay through `POST /api/sync`, the one Route Handler VII 2.1.0 allows for them. | ✅ | ✅ |
| Quality gates (2.1.0) | typecheck, lint, test, test:db, test:e2e and `pnpm build` pass; installable per Chrome's installability check (`us1-install` asserts `Page.getInstallabilityErrors` is empty); Lighthouse performance ≥ 90; spec Status updated. | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| Replay own queued ops (`POST /api/sync`) | ✓ own records only | – (403) | `requireRole('student')` + per op `requireLessonReader(lessonId)` / `where: { studentId: me.id }` |
| Upload a queued draft photo | ✓ own folder | – | Storage RLS `submission_files_rw` (004), path checked again by `isOwnSubmissionPath` in `submission.save` |
| Read cached data offline | ✓ own | ✓ own | Data was fetched through the guarded Route Handlers. The device copy is keyed by user id and wiped on sign-out |
| Install, banner, update toast | ✓ | ✓ | none (no data) |
| Any other write offline | – (disabled) | – (disabled) | `useNeedsConnection`; online paths unchanged |

## Project Structure

### Documentation (this feature)

```text
specs/008-pwa-offline/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R16
├── data-model.md        # 2 columns; Dexie tables; outbox states and coalescing
├── quickstart.md        # prerequisites, commands, manual scenarios
├── contracts/
│   ├── sync-route.md        # POST /api/sync
│   ├── service-worker.md    # worker, manifest, /~offline, headers
│   └── ui-routes.md         # banner, install, update, not-saved sheet, offline behaviour per screen
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── sw.ts                                  # Serwist worker + 006's push handlers (moved)
│   ├── serwist/[path]/route.ts                # createSerwistRoute → /serwist/sw.js
│   ├── ~offline/page.tsx                      # offline fallback
│   ├── manifest.ts                            # icons, id, scope, orientation
│   ├── layout.tsx                             # SerwistProvider, appleWebApp, viewportFit: cover
│   ├── s/layout.tsx · a/layout.tsx            # <PersistQueries userId> around children; <OfflineRuntime>; PWA pieces
│   └── api/sync/route.ts (+ .test)            # guard → parse union → feature apply() per op
├── lib/offline/
│   ├── db.ts                                  # Dexie schema (data-model.md §2)
│   ├── outbox.ts (+ .test)                    # enqueue + coalescing, states, rebase, counts
│   ├── sync.ts (+ .test)                      # triggers, batches to /api/sync, photo upload first, backoff, 401 pause
│   ├── accepted-time.ts (+ .test)             # R8, pure; used by both features' sync-ops
│   ├── persister.ts (+ .test)                 # Dexie persister for PersistQueryClientProvider
│   ├── keep-course.ts (+ .test)               # warm + LRU eviction choice (pure part tested)
│   └── wipe.ts                                # wipeOfflineData(), pendingCount() — used by sign-out
├── lib/query/persist-queries.tsx              # client: PersistQueryClientProvider over the same browser client
│                                              #   (root QueryProvider unchanged: the root layout can't know the user)
├── features/pwa/components/offline-runtime.tsx  # client: deleteOtherUsers + startSync for students (layouts are server)
├── lib/push-device.ts                         # SERVICE_WORKER_URL → /serwist/sw.js
├── components/shared/
│   ├── use-needs-connection.ts                # disabled offline; reason in the banner
│   ├── sync-pill.tsx                          # "Will sync" / "Will submit"; used by progress and shifts
│   └── bottom-sheet.tsx · tab bar             # safe-area padding
├── features/pwa/                              # used only by the two layouts
│   ├── install.ts (+ .test)                   # visit counting, 14-day dismissal, platform detection
│   └── components/ offline-banner · install-prompt · update-toast · dropped-changes-sheet .tsx
├── features/progress/
│   ├── sync-ops.ts (+ .test)                  # progress.*, submission.*, focus.* schemas + apply
│   ├── repo.ts                                # opId/base/accepted time params; client_op_id writes
│   ├── offline.ts                             # client: enqueue + optimistic cache for complete, draft, submit, focus
│   └── use-focus-timer.ts · components/*      # offline branches, pills, "Not available offline", Notes useNeedsConnection
├── features/courses/use-keep-course-offline.ts  # runs lib/offline/keep-course on the student course page
├── features/shifts/
│   ├── sync-ops.ts (+ .test)                  # shift.save, shift.delete
│   ├── overlap.ts (+ .test)                   # findLocalOverlap (pure)
│   ├── offline.ts                             # client enqueue + optimistic cache
│   └── repo.ts · components/*                 # client_op_id / base checks; rotation + settings useNeedsConnection
├── features/profile/components/me-view.tsx    # sign-out confirm + wipe
├── features/notifications/use-device-reminders.ts  # waits for the registered worker
├── features/{admin,assignments,alerts,courses,…}/components  # useNeedsConnection on write controls
└── i18n/messages/{en,my,ja}.json              # pwa.*, offline errors.*

public/icons/ icon-192.png · icon-512.png · icon-maskable-512.png · apple-touch-icon.png
public/sw.js                                   # deleted
next.config.ts                                 # withSerwist; headers() (CSP, HSTS, …)
prisma/schema.prisma                           # Submission.clientOpId, Shift.updatedAt
prisma/migrations/<UTC timestamp>_offline_versions/migration.sql
supabase/tests/008_offline_versions.test.sql
tests/e2e/us1-install · us2-offline · us3-update .spec.ts
tests/e2e/fixtures/offline.ts                  # go offline/online, read IndexedDB outbox, wait for the worker
```

**Structure Decision**: one Next.js app, as in 001–007.
- **`src/lib/offline`** holds the generic machinery (Dexie, outbox, sync loop, persister, wipe, accepted time). It knows op *types* only as strings and never imports a feature.
- **Each feature owns its ops**: `sync-ops.ts` on the server (schemas + `apply`) and `offline.ts` on the client (enqueue + optimistic cache).
  - `app/api/sync/route.ts` composes the server parts, as every Route Handler composes features.
  - The sync loop gets op labels and cache updates through a small registry each feature's `offline.ts` fills, so `lib` stays feature-free.
- **`features/pwa`**: the banner, install sheet, update toast and Not-saved sheet are used only by the two layouts, so they form their own small feature.
- **Shared components**: `useNeedsConnection` and `SyncPill` are used by several features, so they are shared from the start. The third-copy rule is already met: `useNeedsConnection` alone has more than ten users.
- **The keep-offline hook lives in `features/courses`**: it runs on the student course page, which `features/courses` owns.

**Documentation updates in this feature**:
- `docs/technical-spec.md`:
  - §10 as built: `@serwist/turbopack` at `/serwist/sw.js`; the R2 cache table; the outbox with coalescing, `/api/sync`, the R7 rules and R8 times; the persisted cache per user; keep-course and eviction; the update flow; sign-out wipe;
  - §3: `lib/offline/*`, `features/pwa`, `app/sw.ts`, `app/serwist/[path]/route.ts`, `app/api/sync`;
  - §14: the CSP as shipped and why `'unsafe-inline'`;
  - §7: the persister is Dexie, not `idb-keyval`.
- `docs/data-model.md`: `submissions.client_op_id`, `shifts.updated_at`.
- `specs/008-pwa-offline/spec.md`: Status → Implemented when done.

## Complexity Tracking

Constitution 2.1.0 (amended after /speckit-analyze) allows the Route Handler replay and `@serwist/turbopack`, so the rows below record deviations from `docs/technical-spec.md` §10 and §14, which T052 brings up to date.

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Queued writes replay through a Route Handler (`POST /api/sync`), not the Server Actions or the technical spec §10's "sync.ts replays to Supabase" (now allowed by constitution VII 2.1.0) | Server Action ids are rebuilt every deploy. An outbox filled offline before a deploy must still replay after it (R6) | Replaying through Server Actions breaks after any deploy while a phone is offline. The handler reuses each action's Zod field schemas, guard and repo function, so the rules keep one source; online writes still use the Server Actions. |
| `@serwist/turbopack` (worker served by a Route Handler at `/serwist/sw.js`) instead of the technical spec's `@serwist/next` with `swSrc` | The app builds with Turbopack, and `@serwist/next` needs webpack (R1) | Switching the whole build to `--webpack` for one file changes Tailwind's loader and every build's behaviour. Fallback is recorded if the T001 spike fails. |
| CSP allows `'unsafe-inline'` scripts | Nonces force per-request rendering of every document under Cache Components, and Next's inline RSC scripts can't be hashed (R15) | A nonce CSP turns off static shells app-wide and puts SC-002 and performance ≥ 90 at risk. Everything else is locked to self, Supabase and YouTube-nocookie, with `frame-ancestors 'none'` and `object-src 'none'`. |
| Lesson data's stale-while-revalidate (FR-002) comes from the persisted TanStack Query cache, not the technical spec §10's worker cache of lesson JSON | One copy of user data, wiped and evicted in one place (R2, R4, R11) | A second copy in Cache Storage doubles storage within the 20 MB budget and adds a second place that must be wiped per user. The behaviour (cached at once, refreshed when online) is the same. |
