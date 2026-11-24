---
description: "Tasks for 008 Installable PWA and Offline Use"
---

# Tasks: Installable PWA and Offline Use

**Input**: Design documents from `specs/008-pwa-offline/`: plan.md, spec.md, research.md, data-model.md, contracts/ (sync-route.md, service-worker.md, ui-routes.md) and quickstart.md.

**Prerequisites**:
- plan.md and spec.md (clarified 2026-11-24, five answers).
- 001–007 merged on `main`. The tasks rely on:
  - 006's `public/sw.js` push and `notificationclick` handlers, `src/lib/push-device.ts` and `useDeviceReminders`;
  - 004's `completeLesson`/`undoCompletion`/`saveDraft`/`submitAssignment`/`startFocus`/`stopFocus` (actions + repo, which already take `now`), `lib/image.ts` `resizeImage`, `features/progress/upload.ts` `uploadSubmissionImage`, `isOwnSubmissionPath`;
  - 005's `saveShift`/`deleteShift` (repo + `saveShiftSchema`);
  - `useOnline`, `BottomSheet`, `ThemeColorMeta`, `Prefetched`;
  - the e2e fixtures `createConfirmedUser`, `signIn`/`signedInPage`, `linkStudent`, `seedCourse`, `assignCourse`, `uploadLessonFile`, `seedShift`, `softDeleteLesson`, `seedSubmission` and `sql`.
- Out of scope: Background Sync, queueing Notes / rotation / settings / Admin writes (R14), a manual "Download course" button (R3).

**Tests**: required by constitution III (test-first):
- pgTAP for the migration;
- Vitest unit tests (with `fake-indexeddb`) for every `src/lib/offline` module, `features/pwa/install.ts` and `features/shifts/overlap.ts`, written and failing before the code;
- dev-DB tests for each feature's `sync-ops` (one per research R7 row) and the `/api/sync` guard;
- Playwright for every user story at 390×844 and 1280×800 with axe.

  The worker is off in `pnpm dev`, so **every e2e run uses a production build on :3100**: `rm -rf .next/cache && pnpm build && PORT=3100 pnpm start`, then `PLAYWRIGHT_BASE_URL=http://localhost:3100`. Leave the dev server on :3000 alone. Before any DB-backed or e2e run, check that no other session is running tests or a :3100 server. While implementing, run one happy-path test per story with `--grep`; the whole files run in the gates task (T058).

**Organization**: grouped by user story in the spec's priority order:
- **US1** (P1): install on Android, iOS and desktop;
- **US2** (P1): study offline (keep courses, the outbox, sync, conflicts, the banner, sign-out wipe);
- **US3** (P2): "Update ready — Reload".

The worker, the Dexie database, the offline page and the headers are Foundational: every story runs on them.

**Changes to plan.md › Source Code** (CLAUDE.md › Single responsibility):

| Module | plan.md | Here | Why |
| --- | --- | --- | --- |
| op registry (labels, cache updates per op type) | "a small registry" | `src/lib/offline/registry.ts` | `sync.ts` must stay feature-free; each feature's `offline.ts` registers its types |
| worker message helpers (`KEEP`, `FORGET`, `SKIP_WAITING`) | inside callers | `src/lib/offline/worker-messages.ts` | used by keep-course, wipe and the update toast |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md
- Field rules cite `data-model.md` (`table.field`) instead of repeating them.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: prove the Serwist Turbopack route works here, add the packages, and make the icons.

- [X] T001 Spike (research R1, "Verify first"). Install `serwist` and `@serwist/turbopack` (deps) and `esbuild` (dev), pinned. Add:
  - `withSerwist` around the existing config in next.config.ts (keep `withNextIntl` and every option);
  - a minimal src/app/sw.ts (precache + `defaultCache` + `/~offline` fallback, `skipWaiting: false`, `clientsClaim: true`);
  - src/app/serwist/[path]/route.ts (`createSerwistRoute`, `swSrc: 'src/app/sw.ts'`, `additionalPrecacheEntries: [{ url: '/~offline', revision }]`, revision = `SW_REVISION` ?? `VERCEL_GIT_COMMIT_SHA` ?? `git rev-parse HEAD` (research R1), also exposed as `NEXT_PUBLIC_BUILD_ID` from next.config.ts);
  - a placeholder src/app/~offline/page.tsx;
  - `SerwistProvider swUrl="/serwist/sw.js"` (scope `/`, off in development) in src/app/layout.tsx.

  Then `pnpm build` and `PORT=3100 pnpm start` and check five things:
  1. the build passes with `cacheComponents: true`. If the route's re-exported `dynamic`/`revalidate` fail, keep only `generateStaticParams` + `GET`;
  2. `/serwist/sw.js` answers with `Service-Worker-Allowed: /`. Add it in the route if missing;
  3. the registration's scope is `/`;
  4. `pnpm dev` registers nothing;
  5. offline in DevTools, a client-side link to a page visited once renders from cache (RSC fetch fails → full load → `pages`), and one never visited shows `/~offline`.

  Record the results here. If 1–3 can't be made to work, stop and switch to `@serwist/next` + `next build --webpack` (plan.md › Complexity Tracking) before going on.

  (2026-11-24, `serwist`/`@serwist/turbopack` 9.5.15, `esbuild` 0.28.2. All five pass on the :3100 build:
  1. the build passes. Serwist's plain `GET` left the route dynamic (ƒ), which on Vercel would build the worker per request without `.next/static`. The route now builds the file inside a `'use cache'` function and re-exports only `generateStaticParams` + `GET`, so `/serwist/sw.js` is prerendered (●). 102 precache entries, ≈ 3.9 MB;
  2. Serwist's route already sends `Service-Worker-Allowed: /`;
  3. scope `http://localhost:3100/`, script `/serwist/sw.js`, controlled after reload;
  4. `pnpm dev` (:3000) has 0 registrations;
  5. offline, a client link to `/sign-up?role=student` rendered "Create your account" from cache, and `/forgot-password` (never visited) showed `/~offline`.

  Also found: Serwist's `defaultCache` caches `/api/*` JSON (`apis`) and cross-origin responses (signed Storage URLs), and files navigations under `others`, which breaks R2. src/app/sw.ts therefore defines R2's rules itself, and research R2 and the worker contract are updated to match. `public/sw.js` deleted; the full worker (T006's content) went in with the spike because it is the same file.)
- [X] T002 [P] Install `dexie` 4 and `@tanstack/react-query-persist-client` (same minor as `@tanstack/react-query`) as deps, and `fake-indexeddb` as a dev dep, pinned. Add `import 'fake-indexeddb/auto'` to vitest.setup.ts so Dexie tests run in jsdom.
- [X] T003 [P] Make the icons in public/icons/: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (the mark within the 80 % safe zone, theme background filled to the edges) and `apple-touch-icon.png` (180). Draw them from `src/components/shared/app-mark.tsx`'s SVG with a one-off script in the scratchpad; don't commit the script. Check the maskable icon with a circle mask. (Done: drawn from the app mark's proportions with Playwright; the maskable check spans 40 % of the edge, inside the safe circle.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the real worker (with 006's push handlers), the offline page, the Dexie database, worker messaging and the security headers. After this phase the app has a working worker in production that all stories build on.

**⚠️ CRITICAL**: no user story work starts until this phase is complete.

### Tests first

- [X] T004 [P] Write unit tests in src/lib/offline/db.test.ts (data-model.md §2). Cases:
  - the `studymate` database opens at version 1 with tables `outbox`, `outboxFiles`, `queryCache`, `offlineCourses` and the indexes listed for each (data-model.md outbox, outboxFiles.path, queryCache.userId, offlineCourses.courseId);
  - `deleteOtherUsers(userId)` removes every row whose `userId` differs and keeps the user's own (research R10).

### Implementation

- [X] T005 Write src/lib/offline/db.ts: the Dexie schema from data-model.md §2, with types for `OutboxEntry`, `OutboxFile`, `OfflineCourse` and `QueryCacheRow`. `outbox.type` and `outbox.state` are string unions from data-model.md outbox.type and outbox.state. Also add `deleteOtherUsers(userId)`. Lazy-open, so server rendering never touches IndexedDB. T004 passes.
- [X] T006 Finish src/app/sw.ts (contracts/service-worker.md › Worker):
  - move 006's `push` and `notificationclick` handlers and `tellOpenWindows` from public/sw.js unchanged (FR-005);
  - runtime caching = a `media` rule first (research R2: CacheFirst, CORS refetch, ExpirationPlugin 300 / 30 d / `purgeOnQuotaError`, status 200 only), then Serwist's `defaultCache`;
  - the `/~offline` fallback for documents;
  - the `message` handlers `SKIP_WAITING`, `KEEP` (fetch through the matching rule; reply `{ type: 'KEPT', url, bytes }` on the port) and `FORGET` (delete from `pages` and `media`).

  Delete public/sw.js.

  (Done with T001, same file. The rules are written out instead of `defaultCache` (T001 note). Outside production the worker precaches nothing and runs NetworkOnly, because 006's reminders can register it under `next dev`.)
- [X] T007 Change `SERVICE_WORKER_URL` to `/serwist/sw.js` in src/lib/push-device.ts (update its comment to cite 008 R1). In src/features/notifications/use-device-reminders.ts, register the new URL with scope `/`. (Changed while implementing: awaiting only `ready` would hang under `next dev`, where `SerwistProvider` doesn't register; re-registering a registered worker returns it.) Update comments in src/server/notifications/push.ts and src/features/notifications/components/mark-read-on-open.tsx that name public/sw.js. Run 006's push-related Vitest tests.
- [X] T008 [P] Write src/lib/offline/worker-messages.ts: `postToWorker(message)` with a `MessageChannel` reply, plus `keepUrls(urls)` → `{ url, bytes }[]`, `forgetUrls(urls)` and `skipWaiting()`. All are no-ops when there is no controller (dev, first load). Types match contracts/service-worker.md.
- [X] T009 [P] Build the real src/app/~offline/page.tsx (contracts/service-worker.md › `/~offline`): app mark, `pwa.offlinePage.title`, `.body`, link home. Static, translated from the `locale` cookie as 001 does for auth pages. Add the `pwa.offlinePage.*` keys to src/i18n/messages/{en,my,ja}.json.
- [X] T010 Add `headers()` to next.config.ts (research R15; contracts/service-worker.md › Headers): CSP, HSTS, `Referrer-Policy` and `X-Content-Type-Options` for `/:path*`, built from `NEXT_PUBLIC_SUPABASE_URL`, with the development additions (`'unsafe-eval'`, `ws:`). Add `Cache-Control: no-cache` + `Service-Worker-Allowed: /` for `/serwist/sw.js`. On the production build, check by hand that the browser console has no CSP violations on:
  - sign-in, Today and a lesson with an image, a PDF and a YouTube embed;
  - an Admin lesson editor uploading a file;
  - the inbox with Realtime connected.

  (2026-11-24: a temporary Playwright check on the :3100 build covered all of these with 0 console CSP violations. The lesson image loaded, the YouTube frame was attached, the Admin's PDF upload went through, and the inbox loaded with Realtime. Changes from the contract: `media-src` added for lesson audio; `upgrade-insecure-requests` left out (research R15).)

**Checkpoint**: production build has the worker at scope `/`, push still works (006 quickstart scenario for a test push), `/~offline` shows offline, no CSP errors.

---

## Phase 3: User Story 1 — Install on Android, iOS and desktop (Priority: P1) 🎯 MVP

**Goal**: the app installs from Chrome/Edge (prompt on the 2nd visit, dismissable for 14 days) and from iPhone Safari (steps sheet). Installed, it opens standalone with its icon and name and respects safe areas.

**Independent Test**: on the production build, the manifest has no installability errors. The prompt appears on the 2nd session, not the 1st. Not now hides it for 14 days. An iOS Safari user agent sees the steps sheet. Standalone layout clears the notch and home bar.

### Tests for User Story 1

- [X] T011 [P] [US1] Write unit tests in src/features/pwa/install.test.ts (research R12; data-model.md › Browser storage installVisits, installDismissedUntil, installVisitCounted). Cases:
  - `countVisit()` increments once per session;
  - `shouldOffer({ visits, dismissedUntil, now, isStandalone, platform })` is false on visit 1, true on visit 2, false until `dismissedUntil`, true after it, and false when standalone or `platform: 'none'`;
  - `dismiss(now)` stores `now + 14 d`;
  - `detectPlatform(userAgent, hasPromptEvent)` gives `'prompt'`, `'ios'` (iPhone/iPad Safari, not CriOS/FxiOS) or `'none'`;
  - throwing storage gives "don't offer" without errors.
- [X] T012 [P] [US1] Write tests/e2e/us1-install.spec.ts on the production build (spec US1 scenarios 1–3):
  - CDP `Page.getInstallabilityErrors` is empty, and `/manifest.webmanifest` has the icons, `display: standalone` and `id`;
  - 1st visit: no sheet. A new page in the same context after clearing `sessionStorage` (2nd session): "Install StudyMate" sheet. Dispatch a synthetic `beforeinstallprompt` to drive the Chromium path;
  - Not now → gone, and stays gone on a 3rd session. With `installDismissedUntil` in the past → shown;
  - a context with an iPhone Safari user agent → the steps sheet with three steps;
  - with `display-mode: standalone` emulated → no sheet; the tab bar's bottom padding includes the safe-area inset (computed style with `env()` emulated through a CSS variable check);
  - axe has no serious violations on the open sheet.

  (Done. The standalone case overrides `matchMedia('(display-mode: standalone)')` in an init script. The safe-area padding check was dropped: Chromium can't emulate `env(safe-area-inset-*)`, so it stays a real-phone check in T059.)

### Implementation for User Story 1

- [X] T013 [P] [US1] Update src/app/manifest.ts to contracts/service-worker.md › Manifest (`id`, `scope`, `orientation`, the three icons). Replace its comment: 008 FR-001.
- [X] T014 [P] [US1] In src/app/layout.tsx, add to the metadata `appleWebApp` (`capable`, `statusBarStyle: 'default'`, `title`) and `icons.apple`, and add `viewportFit: 'cover'` to the viewport (research R12). Keep 007's `ThemeColorMeta`.
- [X] T015 [US1] Add safe-area padding (research R12; contracts/ui-routes.md › Accessibility): `pb-[env(safe-area-inset-bottom)]` on the tab bars in src/app/s/(tabs)/layout.tsx and src/app/a/(tabs)/layout.tsx; top inset on the sticky top bars in those layouts (and on the full-screen pages' top bars that don't use them: lesson, shift editor, Admin editors); bottom inset on src/components/shared/bottom-sheet.tsx. Check at 390×844 that nothing moves in the browser (insets are 0 there). (Done. Already in place from earlier features: the tab bars, AuthShell, Admin welcome and Screen's action bar. Added: the bottom-sheet bottom inset, the four sticky editor headers (shift, rotation, rule, composer), and body inline insets for landscape. Tab-page top bars need nothing: with `statusBarStyle: 'default'`, iOS lays the page out below the status bar.)
- [X] T016 [US1] Write src/features/pwa/install.ts: pure functions plus thin storage wrappers for data-model.md › Browser storage installVisits, installDismissedUntil and installVisitCounted, each `localStorage`/`sessionStorage` access in try/catch. T011 passes.
- [X] T017 [US1] Write src/features/pwa/components/install-prompt.tsx (contracts/ui-routes.md › InstallPrompt):
  - capture `beforeinstallprompt` with `preventDefault()`, count the visit on mount, decide with `shouldOffer`;
  - render `BottomSheet` with the Chromium content (Install → `prompt()`, then hide; Not now → `dismiss`) or the iOS steps (lucide `Share`, `SquarePlus`);
  - buttons ≥ 44 px, tokens only.
- [X] T018 [US1] Render `<InstallPrompt />` in src/app/s/layout.tsx and src/app/a/layout.tsx (not on auth pages, `/join` or `/~offline`). Add the `pwa.install.*` keys (title, body, install, notNow, iosTitle, iosStep1–3, gotIt) to src/i18n/messages/{en,my,ja}.json; no pronouns.
- [X] T019 [US1] Run tests/e2e/us1-install.spec.ts (one `--grep` smoke while iterating) on the production build until green. (2026-11-24: 8/8 on mobile and desktop.)

**Checkpoint**: the app installs on both platforms; quickstart.md §4 scenarios 1–4.

---

## Phase 4: User Story 2 — Study offline (Priority: P1)

**Goal**: a course opened online is readable offline (≤ 20 MB media). Complete/undo, drafts with photos, Submit, focus sessions and single-shift edits are saved locally with "Will sync" and replayed in order with their original times. Conflicts are dropped and shown. The banner explains the state, other writes say "Needs a connection", and sign-out warns and wipes.

**Independent Test**: quickstart.md §4 scenarios 5–12 and 14–15. `us2-offline.spec.ts` goes offline with `context.setOffline(true)`, does every queued action, reconnects, and checks the database rows and times, one dropped conflict, and the sign-out wipe.

### Tests for User Story 2 (write first, see them fail)

- [X] T020 [P] [US2] Write pgTAP tests in supabase/tests/008_offline_versions.test.sql (data-model.md › pgTAP). Use `begin … rollback`, switching users as 005_shift_policies.test.sql does. Cases:
  - data-model.md submissions.client_op_id: the column exists and is unique (a second row with the same value fails);
  - data-model.md shifts.updated_at: the column exists, is not null and has a default;
  - as one student, updating another student's submission and shift with `client_op_id` set changes 0 rows.
- [X] T021 [P] [US2] Write src/lib/offline/accepted-time.test.ts (research R8; data-model.md › Validation rules FR-003c). `acceptedTime({ at, serverNow, base })` returns:
  - `at` inside [serverNow − 14 d, serverNow];
  - `serverNow` for `at` up to 2 min in the future;
  - `serverNow` beyond 2 min, older than 14 days, or before `base`;
  - `serverNow` when `at` is invalid.

  Add a property test with fast-check: the result is never after `serverNow` and never before `min(serverNow, max(serverNow − 14 d, base))`.
- [X] T022 [P] [US2] Write src/lib/offline/outbox.test.ts (research R5; data-model.md outbox.recordKey, outbox.state, outbox.base, outbox.at, › State transitions and Coalescing). Cases:
  - enqueue sets `state: 'pending'`, `createdAt` and the user id;
  - save after save on the same `recordKey` replaces the payload and keeps `id`, `base` and `at`;
  - submit after save → one `submission.submit` with the newer `at`;
  - complete then undo → nothing pending;
  - new-shift save then delete → nothing pending; edit then delete → one `shift.delete` with the edit's base;
  - coalescing never touches a `syncing` or `dropped` entry;
  - `nextBatch(userId)` is FIFO by `createdAt`, at most 50, only `pending`, only that user's;
  - `markSyncing` / `resolve(results)`: `applied`/`duplicate` delete, `dropped` keeps with `error`, and `retry` returns to `pending` with `attempts + 1`;
  - after `applied` with a `version`, later pending entries with the same `recordKey` get `base.updatedAt = version`;
  - `recoverSyncing()` turns `syncing` back into `pending` on start;
  - `pendingCount(userId)` and `droppedEntries(userId)`.
- [X] T023 [P] [US2] Write src/lib/offline/persister.test.ts (research R4; data-model.md queryCache.client): `createDexiePersister(userId)` persists, restores and removes one `PersistedClient` per user, and another user's restore returns undefined.
- [ ] T024 [P] [US2] Write src/lib/offline/keep-course.test.ts for the pure parts (research R3; data-model.md offlineCourses.bytes, offlineCourses.openedAt). Cases:
  - `pickMedia(resources, budget = 20 MB)` keeps lesson order and skips files that would cross the budget (later smaller ones still fit);
  - `pickEviction(courses, currentCourseId, estimate)` returns the least recently opened course other than the current one while usage > 80 % of quota, and nothing below that;
  - `changedSince(kept, lessons)` lists only lessons and URLs not stored yet.
- [X] T025 [P] [US2] Write src/features/shifts/overlap.test.ts: `findLocalOverlap(shifts, { start, end, exceptId })` matches the repo rule (working shifts only, `start < other.end && end > other.start`, the edited shift excluded), including a night shift across midnight and an Off day (never clashes).
- [X] T026 [P] [US2] Write src/features/progress/sync-ops.test.ts against the dev DB, as src/features/progress/repo.test.ts does. Fixtures: two students, an Admin, a course with lessons (one with a prompt). Cover every progress, submission and focus row of research R7:
  - `progress.complete`: applied with `completed_at` = accepted `at` and `client_op_id` = op id (data-model.md lesson_progress.client_op_id); duplicate on the same id; applied as a no-op when already done elsewhere; dropped `changed_on_server` when `wasDone: true` but the Admin reopened; dropped `lesson_unavailable` after `softDeleteLesson`; `lesson_locked`; `submission_required`;
  - `progress.undo`: the mirror cases;
  - `submission.save`: applied for a new row (`base.updatedAt: null`) and a matching base, returning the new `updated_at` as `version` (data-model.md submissions.client_op_id); duplicate; dropped `changed_on_server` when `updated_at` differs or the status is Submitted/Reviewed; `file_missing` when an attachment path isn't in Storage; a path in another student's folder → `invalid_input`;
  - `submission.submit`: `submitted_at` = accepted `at`, and server time when `at` is before the base;
  - `focus.record`: inserted with `client_op_id` (data-model.md study_sessions.client_op_id) and lesson In progress; duplicate; `focus_overlap`; length over the plan → `invalid_input`;
  - `focus.stop`: `ended_at` = least(accepted `at`, cap); already ended → returns its count; unknown → `session_not_found`;
  - another student's lesson id → `lesson_unavailable`, with no row changed.

  (Done: 19 cases. Progress has no reachable `changed_on_server`. A complete always starts from `wasDone: false`, because coalescing removes complete-after-undo, so a lesson done elsewhere is an applied no-op, as R7's note says.)
- [X] T027 [P] [US2] Write src/features/shifts/sync-ops.test.ts against the dev DB (research R7, shift rows; data-model.md shifts.updated_at, shifts.client_op_id). Cases:
  - new `shift.save` creates with `client_op_id`; a duplicate id returns the same shift;
  - an overnight shift is one record (constitution IV);
  - an edit with a matching `updated_at` applies and bumps `updated_at`;
  - an edit after another change → `changed_on_server`;
  - an overlap → `shift_overlap`;
  - a delete applies; a delete of a shift already gone → `duplicate`; a delete of a rotation shift turns it Off with `client_op_id`;
  - another student's shift id → `shift_not_found`, unchanged.

  (Done. The form's fields travel under `shift`, because 005's form has its own `type` (contract updated). `ShiftView` gains `updatedAt`, the version an offline edit is made on.)
- [X] T028 [P] [US2] Write src/app/api/sync/route.test.ts against the dev DB (contracts/sync-route.md › Errors, Permissions, Tests). Cases:
  - signed out → 401; Admin → 403; a malformed body or 51 ops → 400 with nothing applied;
  - a batch applied + dropped + applied returns three results in order and applies both good ops;
  - an op that throws unexpectedly (mock one `apply`) returns results up to it plus `retry`, and later ops are not applied.

  Call the handler with a request built as the existing route tests do.
- [ ] T029 [P] [US2] Write tests/e2e/fixtures/offline.ts:
  - `goOffline(context)` / `goOnline(context)`;
  - `waitForWorker(page)` (controller set);
  - `outboxRows(page)` (read IndexedDB `studymate.outbox` in the page);
  - `waitForSynced(page)` (outbox empty and banner gone);
  - `cacheNames(page)`.
- [ ] T030 [US2] Write tests/e2e/us2-offline.spec.ts on the production build (spec US2 scenarios 1–4, Edge Cases; quickstart.md §4 scenarios 5–12). Seed a student linked to an Admin, a course with 3 lessons (one image via `uploadLessonFile`, one PDF, one assignment prompt) and a shift week. Then:
  - open the course online and wait for keep-offline (the `offlineCourses` row);
  - go offline, then set the page clock 10 minutes behind real time (`page.clock.setSystemTime`), so the device times differ from the sync time but stay inside research R8's window;
  - open each lesson, see the image and the PDF link working, and the YouTube placeholder;
  - mark one complete → "Will sync"; mark it undone and complete again (coalesced, one entry); draft text plus one photo → "Will sync"; Submit another → "Will submit";
  - run a 15-minute focus session to its end with `page.clock.runFor` → queued `focus.record`;
  - add a shift → "Will sync"; edit a seeded shift and delete another → queued; Rotation's Save disabled with "Needs a connection";
  - the banner says "Offline — changes will sync" and shows the waiting count from the outbox;
  - resume real time (`page.clock.resume` at the real now), go online, `waitForSynced`;
  - in the DB: `completed_at`, `submitted_at` and the focus session's times equal the faked device times (± 1 s); the photo exists in Storage; the new shift has `client_op_id`; the edited shift has the new times; the deleted one is gone;
  - a second focus session started online, then stopped offline → `focus.stop` → `ended_at` is the offline stop time;
  - conflict: offline edit of a draft while `sql` updates its `updated_at` → toast "1 change wasn't saved", the sheet shows the text with Copy, and the server text is unchanged;
  - an Admin context offline: banner "Offline — showing saved data", a course editor's Save disabled with the reason;
  - sign-out with 1 pending: confirm, Cancel keeps the session, Sign out → `studymate` IndexedDB and the `pages`/`media` caches are gone;
  - axe on the banner and the sheet.

### Implementation for User Story 2: server

- [X] T031 [US2] Schema and migration (data-model.md › Migration; docs/data-model.md §7):
  - add `clientOpId` to `Submission` (data-model.md submissions.client_op_id) and `updatedAt` to `Shift` (data-model.md shifts.updated_at) in prisma/schema.prisma;
  - generate prisma/migrations/<UTC timestamp>_offline_versions/migration.sql by diffing against git, and check it matches the expected SQL and drops nothing;
  - `pnpm prisma migrate deploy`, `pnpm prisma generate`, `pnpm test:db` (T020 passes).
- [X] T032 [P] [US2] Write src/lib/offline/accepted-time.ts (pure, no Dexie import; cite R8). T021 passes.
- [X] T033 [US2] Extend the progress repo for replay (research R7, R8) in src/features/progress/repo.ts. Keep the existing online signatures working:
  - `completeLesson` / `undoCompletion` take an optional `{ opId, wasDone, at }`, check duplicate and done-state, and write data-model.md lesson_progress.client_op_id;
  - `saveDraft` / `submitAssignment` take an optional `{ opId, baseUpdatedAt, at }`, check duplicate and base, and write data-model.md submissions.client_op_id. Versions stay server time; only `submitted_at` takes the accepted time;
  - add `recordFocus(student, { opId, lessonId, minutes, startedAt, endedAt })`: insert finished with data-model.md study_sessions.client_op_id (`on conflict (client_op_id) do nothing`), overlap check, lesson → In progress as `startFocus` does;
  - `stopFocus` takes an optional `endedAt`, capped as `CAPPED_END`;
  - add `file_missing` through `findSubmissionFile`'s Storage check for each attachment path.

  The existing src/features/progress/repo.test.ts must still pass.
- [X] T034 [US2] Write src/features/progress/sync-ops.ts (server-only; contracts/sync-route.md):
  - Zod op schemas for `progress.*`, `submission.*` and `focus.*`, extending `completeLessonSchema`, `saveDraftSchema`, `startFocusSchema` and `stopFocusSchema` with `id`, `type`, `at` and `base`;
  - `apply(me, op, serverNow)` for each: `requireLessonReader` (`AuthError` 404 → `lesson_unavailable`), `acceptedTime`, the repo call, and mapping `ActionFailure` to `dropped`.

  T026 passes.
- [X] T035 [US2] Extend the shifts repo (research R7) in src/features/shifts/repo.ts: `saveShift` and `deleteShift` take an optional `{ opId, baseUpdatedAt }`. Add the duplicate check and creation with data-model.md shifts.client_op_id, the base check against data-model.md shifts.updated_at (`changed_on_server`), and delete of a missing shift as `duplicate`. Then write src/features/shifts/sync-ops.ts (op schemas extending `saveShiftSchema`/`deleteShiftSchema`, plus `apply`). T027 passes; the existing shifts repo tests still pass.
- [X] T036 [US2] Write src/app/api/sync/route.ts (contracts/sync-route.md):
  - `handle()` + `requireRole('student')`;
  - build `z.discriminatedUnion('type', …)` from both features' op schemas; `ops` 1..50;
  - one `serverNow` per request (`select now()`);
  - apply in order, each op in its own transaction;
  - an unexpected error → `retry` for that op and stop.

  Add the error codes `lesson_unavailable`, `changed_on_server`, `file_missing` and `focus_overlap` to `errors.*` in src/i18n/messages/{en,my,ja}.json. T028 passes.

### Implementation for User Story 2: device

- [X] T037 [US2] Write src/lib/offline/outbox.ts (research R5; data-model.md outbox.*, › Coalescing) and src/lib/offline/registry.ts (`registerOp(type, { label, onApplied, onDropped })`; types only, no feature imports). T022 passes.
- [X] T038 [US2] Write src/lib/offline/persister.ts (Dexie persister; data-model.md queryCache.client) and src/lib/query/persist-queries.tsx (research R4):
  - a client `PersistQueries({ userId, children })` rendering `PersistQueryClientProvider` over `getBrowserQueryClient()`, with `buster` = `process.env.NEXT_PUBLIC_BUILD_ID` (T001), `maxAge` 7 d, and successful queries only;
  - leave src/lib/query/provider.tsx and the root layout's `QueryProvider` unchanged;
  - raise `gcTime` in src/lib/query/client.ts to 7 d (cite R4);
  - wrap the children of src/app/s/layout.tsx and src/app/a/layout.tsx in `<PersistQueries userId={me.id}>`;
  - write src/features/pwa/components/offline-runtime.tsx, a client `OfflineRuntime({ userId, role })` that calls `deleteOtherUsers(userId)` once on mount (R10), and render it in both layouts. T039 adds sync to it.

  T023 passes; Today still renders its server-prefetched data on first paint.
- [X] T039 [US2] Write src/lib/offline/sync.ts (research R5, R9, R10):
  - `startSync(userId)` runs on `online`, on `visibilitychange` → visible, on start (after `recoverSyncing`), after each enqueue while online, and every 60 s while non-empty;
  - one run at a time; upload `outboxFiles` for the batch first with `uploadSubmissionImage`'s Storage call, an "already exists" answer counting as done; then POST `/api/sync`;
  - `resolve` the results and call the registry's `onApplied`/`onDropped`;
  - network errors back off from 5 s to 60 s; a 401 sets a `paused` flag the banner reads.

  Start it from `OfflineRuntime` for students (T038). (Done. Photo uploads run through a registry `prepare` hook, so `lib/offline` imports no feature. A 400 drops the whole batch as `invalid_input` instead of retrying forever. An entry that was sent once is never merged into (it may already be applied under its id); a later change gets its own entry and is rebased.) Expose `useOutboxState()` (pending count, dropped entries, paused, syncing) with Dexie `liveQuery`. Add src/lib/offline/sync.test.ts with a mocked `fetch`: order kept, upload before the op, 401 pauses without deleting, `retry` backs off.
- [X] T040 [P] [US2] Write src/components/shared/online-only.tsx (contracts/ui-routes.md › Shared pieces) and src/components/shared/sync-pill.tsx ("Will sync" / "Will submit", reading the outbox by `recordKey`). Add the `pwa.needsConnection`, `pwa.willSync` and `pwa.willSubmit` keys in all 3 message files.
- [X] T041 [US2] Write src/features/progress/offline.ts:
  - `enqueueComplete`/`enqueueUndo` with `base: { wasDone }`, `enqueueDraft`/`enqueueSubmit` with `base: { updatedAt }` from the cached `lessonWorkKeys.work` data, and `enqueueFocusRecord`/`enqueueFocusStop`;
  - optimistic `setQueryData` on the same keys the online mutations update;
  - `registerOp` for each type: label = lesson title; `onApplied` invalidates the keys the Server Actions' `onSettled` does.

  (Done, with one change: there is no per-type registry. After any batch, the sync loop refetches active queries, which covers what each Server Action's `onSettled` invalidated and undoes optimistic changes when an op is dropped. Photo uploads moved into `lib/offline/queued-files.ts`, so they never depend on a feature's code being loaded. A focus session started offline lives in an in-memory store: the `['focus']` query refetches on reconnect and would wipe a running timer. It survives navigation, not a reload.)

  Then the call sites:
  - src/features/progress/components/lesson-bottom-bar.tsx: offline, or when the Server Action rejects with a network `TypeError`, enqueue instead, and show `SyncPill`;
  - src/features/progress/use-focus-timer.ts: offline start runs a local session; stop or auto-stop enqueues `focus.record`, or `focus.stop` for a session started online.
- [X] T042 [US2] Offline drafts with photos in src/features/progress/components/assignment-editor.tsx and src/features/progress/components/image-strip.tsx (research R9; data-model.md outboxFiles.blob, outboxFiles.path):
  - offline autosave → `enqueueDraft`;
  - Add photo offline → `resizeImage`, store in `outboxFiles` under a new `<studentId>/<lessonId>/<uuid>.<ext>` path, show the Blob URL with "Will sync";
  - removing a pending photo deletes its file row;
  - Submit offline → `enqueueSubmit`, with the editor read-only as when submitted and "Will submit";
  - limits from 004 (`MAX_IMAGES`, `MAX_IMAGE_BYTES`).
- [ ] T043 [US2] Write src/features/shifts/overlap.ts (T025 passes) and src/features/shifts/offline.ts (`enqueueShiftSave`/`enqueueShiftDelete`, client-generated id for new shifts, optimistic `shiftKeys` updates, `registerOp` with the shift's local date as label). In src/features/shifts/components/shift-editor.tsx, offline → check `findLocalOverlap` against cached shifts (the same error text as online), then enqueue. Show `SyncPill` on src/features/shifts/components/day-card.tsx and src/features/shifts/components/shift-calendar-row.tsx for pending shifts.
- [ ] T044 [US2] Apply `OnlineOnly` to every component in contracts/ui-routes.md › Controls that get `OnlineOnly` (research R14). Disabled controls keep their place, with "Needs a connection" underneath.
  - `use-autosave.ts` (lesson editor) pauses offline and shows the reason instead of failing.
  - Inbox mark-read waits until online.
  - Before committing, re-run `grep -rl useMutation src/features src/components`, and add any component missing from the contract's table to both the table and this change.

  Add tests/e2e/us2-offline.spec.ts › "nothing that can't queue is sent offline": as an Admin and as a student, go offline, visit each tab and each editor screen, and check every control from the table is disabled with its reason. Record `page.on('request')` and check no Server Action POST (`next-action` header) is sent.
- [ ] T045 [US2] Keep courses offline (research R3; data-model.md offlineCourses.*):
  - write src/lib/offline/keep-course.ts (`pickMedia` within data-model.md offlineCourses.bytes's 20 MB, `pickEviction` by data-model.md offlineCourses.openedAt, `changedSince` — T024 passes — plus `keepCourse({ userId, courseId, lessons, fetchQuery })`: idle-time and sequential, fetch the lesson queries, `keepUrls` for the lesson documents and the picked media, update the row; `evictIfNeeded` with `forgetUrls` and `removeQueries`; `navigator.storage.persist()` once when standalone);
  - write src/features/courses/use-keep-course-offline.ts and call it from src/features/courses/components/student-course-view.tsx when online;
  - in src/features/courses/components/attachment-list.tsx, show "Not available offline" offline for files not in the row's `mediaUrls`;
  - in src/components/shared/youtube-embed.tsx, show "Video needs a connection" offline.

  Add the `pwa.notOffline` and `pwa.videoOffline` keys.
- [X] T046 [US2] Write src/features/pwa/components/offline-banner.tsx and src/features/pwa/components/dropped-changes-sheet.tsx (contracts/ui-routes.md › Global pieces): student and Admin wording, "{n} waiting", "Syncing {n}…", the 401 "Sign in to sync" link, the toast "{n} changes weren't saved" → sheet with label, `errors.*` reason, the draft text with Copy, and OK deleting the dropped rows. Render both in src/app/s/layout.tsx and the banner in src/app/a/layout.tsx (sync already starts from `OfflineRuntime`, T038/T039). Add the `pwa.banner.*` and `pwa.dropped.*` keys.
- [ ] T047 [US2] Sign-out warning and wipe (FR-004a; research R11):
  - write src/lib/offline/wipe.ts: `wipeOfflineData()` deletes the Dexie database and the `pages`, `pages-rsc`, `pages-rsc-prefetch` and `media` caches, then clears the query client. `pendingCount` is re-exported;
  - in src/features/profile/components/me-view.tsx, Sign out first counts pending entries. If any, show a confirm (`AlertDialog` or `BottomSheet`) "{n} changes not synced yet — sign out anyway?" with Cancel / Sign out. Then wipe, then the existing push unsubscribe + `signOut`. Offline: the wipe, the push unsubscribe, then supabase-js `auth.signOut({ scope: 'local' })` and `router.replace('/sign-in')` (research R11 › Offline sign-out).

  Add the `pwa.signOutPending.*` keys.
- [ ] T048 [US2] Run tests/e2e/us2-offline.spec.ts (smoke with `--grep` while iterating) on the production build until green. Fix whatever it finds in the task that owns the file.

**Checkpoint**: quickstart.md §4 scenarios 5–12 pass by hand on the production build.

---

## Phase 5: User Story 3 — Updates (Priority: P2)

**Goal**: when a new version is deployed and the app is open, a persistent "Update ready — Reload" toast appears; nothing reloads by itself, and Reload first lets the outbox finish.

**Independent Test**: with the app open on build A, start build B on the same port; the toast appears. An open draft keeps its text until Reload; Reload brings B's worker in control.

### Tests for User Story 3

- [ ] T049 [P] [US3] Write tests/e2e/us3-update.spec.ts on the production build (spec US3 scenario 1; research R13). Open a lesson's assignment editor and type a draft. Then make the waiting worker either by:
  - rebuilding with a new `SW_REVISION` (T001) and restarting the :3100 server, which changes the worker's `/~offline` revision and so its bytes (research R1), or
  - if the rebuild takes over 2 minutes, a second production build made beforehand with another `SW_REVISION` in a copied `.next`, swapped in before the restart.

  Never use a test-only route in production code.

  Check:
  - the "Update ready" toast appears and stays;
  - the page did not reload (a `window` marker survives) and the draft text is unchanged;
  - Reload → `controllerchange` → the new worker controls and the page reloaded.

### Implementation for User Story 3

- [ ] T050 [US3] Write src/features/pwa/components/update-toast.tsx (contracts/ui-routes.md › UpdateToast):
  - watch `navigator.serviceWorker.getRegistration()` for `waiting`, and `updatefound` → `installed` while a controller exists;
  - check for updates on `visibilitychange` → visible (`registration.update()`);
  - show a Sonner toast with `duration: Infinity` and a Reload action;
  - Reload: `await` one sync run (≤ 5 s, via `lib/offline/sync.ts`), then `skipWaiting()` from worker-messages, then `location.reload()` on `controllerchange`.

  Render it in src/app/s/layout.tsx and src/app/a/layout.tsx. Add the `pwa.update.ready` and `pwa.update.reload` keys.
- [ ] T051 [US3] Run tests/e2e/us3-update.spec.ts on the production build until green.

**Checkpoint**: quickstart.md §4 scenario 13.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T052 [P] Update docs/technical-spec.md:
  - §10 as built: `@serwist/turbopack` at `/serwist/sw.js`; the R2 cache table; keep-course and eviction; the outbox with coalescing; `/api/sync`; the R7 rules and R8 window; the per-user persisted cache; the update flow; the sign-out wipe;
  - §3: `lib/offline/*`, `features/pwa`, `app/sw.ts`, `app/serwist/[path]/route.ts`, `app/api/sync`, `app/~offline`; remove `public/sw.js`;
  - §7: the Dexie persister instead of `idb-keyval`;
  - §14: the CSP as shipped and why `'unsafe-inline'`;
  - §2: the new packages.
- [ ] T053 [P] Update docs/data-model.md: `submissions.client_op_id` and `shifts.updated_at` in the model section, and a note that `client_op_id` columns are written by `/api/sync` (008 R7).
- [ ] T054 [P] Review the new `my` and `ja` strings (`pwa.*` and the four new `errors.*`) against their `en` meaning, and list them in the commit for the user's review, as 007 did.
- [ ] T055 At 390×844 and 1280×800, in all 3 languages at Large text (007), check that the banner, install sheet, Not-saved sheet, pills and "Needs a connection" lines fit without clipping, and the tab bar keeps 44 px targets. Fix in the owning component.
- [ ] T056 Performance (SC-001, SC-002; quickstart.md §5):
  - Lighthouse mobile on `/s/today` of the production build, performance ≥ 90;
  - the Manifest panel shows no installability errors;
  - installed cold start with a warm cache under 4× CPU + Slow 4G reaches a usable Today in < 2 s.

  Record the numbers here. If restoring the persisted cache delays first render, restore only the `/s` queries for the current route first.
- [ ] T057 [P] Remove dead code: anything that referenced `public/sw.js`. Check that `useDeviceReminders` has no leftover registration and nothing imports a removed helper.
- [ ] T058 Gates:
  - `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm test:db`;
  - `rm -rf .next/cache && pnpm build`;
  - `PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e` for the whole suite on the production build. The worker and CSP now apply to every page, so 001–007's specs must still pass; check other sessions first.

  Record the results here.
- [ ] T059 Walk through quickstart.md §4 scenarios 1–15. For each, record the test that covers it or what wasn't checked. List as manual steps for the user:
  - a real Android install;
  - a real iPhone Add to Home Screen with notch and home-bar insets;
  - scenario 14 (push tapped offline) on a phone. This is manual by decision (research R16): Playwright can't tap a real notification.
- [ ] T060 Set **Status** to `Implemented` in specs/008-pwa-offline/spec.md (constitution quality gate).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: T001 first; T002 and T003 alongside it. If T001 fails, re-plan the worker build before anything else.
- **Foundational (2)**: after T001 and T002. T004 → T005. T006 and T007 need T001. T008 and T009 are independent. T010 last (it checks every page). Blocks every story.
- **US1 (3)**: after Foundational. Doesn't need US2's database or outbox.
- **US2 (4)**: after Foundational. Its tests T020–T030 can be written alongside US1. Server: T031 → T033 → T034; T031 → T035; T034 + T035 → T036. Device: T037 → T038, T039 → T041–T047. T032 before T034 and T035.
- **US3 (5)**: after Foundational. T050's flush step needs T039; without it, Reload skips the flush, so wire that in once T039 lands.
- **Polish (6)**: after the stories you're shipping. T052–T054 and T057 together; T055 and T056 after the UI is done; T058, T059 and T060 last.

### Within each story

Tests first and failing → schema → pure logic → repo/sync-ops → route → device modules → components → layouts → strings → the story's e2e passes.

### Shared files (no [P] between these tasks)

- next.config.ts: T001 → T010 → T038 (build id)
- src/app/layout.tsx: T001 → T014
- src/app/s/layout.tsx and src/app/a/layout.tsx: T018 → T038 → T046 → T050
- src/features/pwa/components/offline-runtime.tsx: T038 → T039
- tests/e2e/us2-offline.spec.ts: T030 → T044 (adds the offline sweep)
- src/app/sw.ts: T001 → T006
- src/features/progress/repo.ts: T033. src/features/shifts/repo.ts: T035
- src/features/progress/components/*: T041 → T042 → T044
- src/features/shifts/components/*: T043 → T044
- src/i18n/messages/*.json: T009, T018, T036, T040, T045, T046, T047, T050 (one at a time)

### Parallel opportunities

- **Setup**: T002 and T003 alongside T001.
- **Foundational**: T004, T008 and T009 together; T006 and T007 after T001.
- **US1**: T011 and T012 together; T013 and T014 together.
- **US2**: tests T020–T029 together; T032 alongside T031; the server track (T033–T036) alongside the device track (T037–T040).
- **US3**: T049 alongside US2.
- **Polish**: T052, T053, T054 and T057 together.

---

## Parallel Example: User Story 2 tests

```bash
Task: "pgTAP supabase/tests/008_offline_versions.test.sql"
Task: "accepted time src/lib/offline/accepted-time.test.ts"
Task: "outbox src/lib/offline/outbox.test.ts"
Task: "persister src/lib/offline/persister.test.ts"
Task: "keep-course src/lib/offline/keep-course.test.ts"
Task: "local overlap src/features/shifts/overlap.test.ts"
Task: "progress sync-ops src/features/progress/sync-ops.test.ts"
Task: "shift sync-ops src/features/shifts/sync-ops.test.ts"
Task: "/api/sync guard src/app/api/sync/route.test.ts"
```

## Parallel Example: User Story 2 implementation

```bash
# server track
Task: "T031 migration" → "T033 progress repo" → "T034 progress sync-ops" ; "T035 shifts repo + sync-ops" → "T036 /api/sync"
# device track, at the same time
Task: "T037 outbox + registry" → "T038 persister + provider" → "T039 sync loop"
Task: "T040 OnlineOnly + SyncPill"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup (the T001 spike decides the worker build) and Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** with quickstart.md §4 scenarios 1–4: the app installs and opens standalone, and push still works through the new worker.

### Incremental delivery

1. US1 → installable app (deployable on its own).
2. US2 → offline study. Large; deliver in this order, each deployable:
   1. persisted cache + banner + `OnlineOnly` (reads offline, writes say why not);
   2. the server track + outbox + sync for complete/undo;
   3. drafts, photos and Submit;
   4. focus and shifts;
   5. keep-course media and eviction;
   6. sign-out wipe.
3. US3 → the update toast. Ship it with or right after the first US2 slice, so users on an old worker get a clean reload.
4. Polish → docs, strings review, performance, the gates, then Status Implemented.

## Notes

- [P] = different files, no dependency on an unfinished task.
- Commit after each task or logical group, one concern per commit (CLAUDE.md › Focused diffs).
- Field rules cite data-model.md (`table.field`); code comments cite the spec or research decision (e.g. `008 R7`).
- Stop at any checkpoint to validate the story on its own.
