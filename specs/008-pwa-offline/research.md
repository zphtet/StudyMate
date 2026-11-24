# Research: Installable PWA and Offline Use

Phase 0 decisions for [plan.md](plan.md). Each records what was chosen, why, and what was rejected. The spec was clarified on 2026-11-24 (5 answers); nothing is left as NEEDS CLARIFICATION.

## What exists already

- **Manifest** (006): `src/app/manifest.ts` with name, short name, description, `start_url: '/'`, `display: 'standalone'` and light background/theme colours. No icons.
- **Service worker** (006): `public/sw.js`, push and `notificationclick` only, no caching. It calls `skipWaiting()` and `clients.claim()`. It is registered only when a student turns reminders on (`useDeviceReminders`, `SERVICE_WORKER_URL = '/sw.js'` in `src/lib/push-device.ts`), at the default scope `/`.
- **Connectivity**: `useOnline()` (`src/components/shared/use-online.ts`) and an `errors.offline` message.
- **Query client** (`src/lib/query/client.ts`): one browser `QueryClient`, `gcTime` 24 h, `staleTime` 30 s, server prefetch through `Prefetched` + `HydrationBoundary`. Nothing is persisted.
- **Idempotency columns** (`0_init`): `lesson_progress.client_op_id`, `study_sessions.client_op_id`, `shifts.client_op_id`, each `uuid unique`. Nothing writes them yet. `submissions` has none.
- **Versions**: `lesson_progress.updated_at` and `submissions.updated_at` are set by every app write (including `reviewSubmission`). `shifts` has no `updated_at`.
- **Repo functions take `now`**: `completeLesson`, `undoCompletion`, `saveDraft` and `submitAssignment` in `features/progress/repo.ts` already accept `now = new Date()`.
- **Files**: lesson files and submission images are served from stable same-origin URLs, `/api/lesson-files/<id>/<name>` and `/api/submissions/<id>/files/<name>`. Each checks access, then 302-redirects to a 1-hour signed Storage URL. `LessonResource.sizeBytes` is known.
- **Build**: Next 16.4.6 builds with Turbopack (`cacheComponents: true`, `partialPrefetching: true`). E2E runs against a production build on :3100.

## R1. Serwist through `@serwist/turbopack`, served at `/serwist/sw.js`, scope `/`

- **Decision**: use Serwist's Turbopack integration.
  - `withSerwist` wraps `next.config.ts` (after `withNextIntl`).
  - The worker source is `src/app/sw.ts`. A Route Handler `src/app/serwist/[path]/route.ts` (`createSerwistRoute`) builds and serves it at `/serwist/sw.js`, with `additionalPrecacheEntries: [{ url: '/~offline', revision }]`. The revision is `SW_REVISION` when set (the update test sets a new one to force a changed worker), else `VERCEL_GIT_COMMIT_SHA` on Vercel, else the local git SHA. The same value is exposed as `NEXT_PUBLIC_BUILD_ID`.
  - `SerwistProvider` (`@serwist/turbopack/react`) in the root layout registers it with `scope: '/'` and `register` off in development.
  - Packages: `serwist`, `@serwist/turbopack`, and `esbuild` (dev).
- **Rationale**:
  - The app builds with Turbopack. `@serwist/next` needs webpack (`next build --webpack`), which would change the bundler for the whole app, Tailwind's turbopack loader included, to serve one file.
  - The worker must be at scope `/` so it controls `/s/*` and `/a/*`. It must also replace 006's registration on that same scope, so existing push subscriptions survive: a subscription belongs to the registration, not to the script URL.
- **Verify first (T001 spike)**:
  1. The worker response carries `Service-Worker-Allowed: /`. If not, the route adds it.
  2. The route's segment-config re-exports (`dynamic`, `revalidate`) build under `cacheComponents: true`. If they don't, keep only `generateStaticParams` + `GET`.
  3. Nothing registers under `next dev`.

  Fallback if the spike fails: `@serwist/next` with `next build --webpack`, recorded in Complexity Tracking.
- **006 migration**:
  - `SERVICE_WORKER_URL` becomes `/serwist/sw.js`.
  - The worker is registered on every app open in production, not only when reminders are turned on.
  - `public/sw.js` is deleted. Browsers that still have it get the new script at the same scope on their next open.
  - The push and `notificationclick` handlers move into `sw.ts` unchanged (FR-005).
- **Alternatives**:
  - `@serwist/next` + webpack (see above).
  - A hand-written worker without Serwist: re-implements precaching, revisioning and expiration.
  - `next-pwa`: unmaintained, webpack-only.

## R2. What the service worker caches

| Request | Strategy | Cache | Why |
| --- | --- | --- | --- |
| Build assets (`/_next/static/*`), fonts, `/~offline`, icons | precache (`self.__SW_MANIFEST`) | serwist precache | App shell opens with no network (SC-002). |
| Navigations (HTML) and RSC payloads | NetworkFirst, 3 s timeout (own rules: Serwist's `defaultCache` also caches `/api` JSON and cross-origin responses, so it isn't used; T001) | `pages`, `pages-rsc`, `pages-rsc-prefetch` | Fresh when online. The last copy when offline. |
| `/api/lesson-files/*`, `/api/submissions/*/files/*` | CacheFirst, keyed by the stable URL, fetched in CORS mode | `media` (ExpirationPlugin: 300 entries, 30 days) | Lesson images and attachments offline (US2 scenario 1). |
| All other `/api/*` JSON | network only | – | The persisted query cache owns data (R4). |
| Supabase, YouTube, everything cross-origin | network only | – | Signed URLs change hourly. Video is not offline. |
| Offline document with no cached copy | fallback `/~offline` | precache | Never the browser's dino page. |

- **CORS mode for media**: the file routes 302 to Supabase Storage, which sends `Access-Control-Allow-Origin`. The worker refetches with `mode: 'cors'`, `credentials: 'same-origin'` and caches the final, non-opaque response under the original same-origin URL. Opaque responses are padded to about 7 MB each in Chrome's quota accounting, which would break the 20 MB budget.
- **FR-002 "lesson data stale-while-revalidate"** is met by the persisted TanStack Query cache, not a second copy in the worker. It shows the stored data at once and refetches when online (stale-while-revalidate behaviour). One copy means one place to wipe on sign-out (R12) and one place to evict (R3).
- **Offline App Router navigation**: a client-side navigation whose RSC fetch fails falls back to a full page load. The worker answers that load from `pages`, or with `/~offline`. US2's e2e checks this path (see T001 spike).
- **Alternatives**:
  - CacheFirst for pages: a stale shell after deploys, even with the update flow.
  - Caching signed Supabase URLs: the token changes hourly, so entries never match.
  - Caching JSON in the worker as well: double storage, two caches to wipe.

## R3. A course is kept offline when the student opens it

- **Decision**: when a student opens `/s/courses/[courseId]` online, `useKeepCourseOffline(courseId)` runs in the background (idle callback, one request at a time).
  1. Fetch every unlocked lesson's queries (`lessonKeys.detail`, `lessonWorkKeys.work`) into the query cache, which is persisted (R4).
  2. Fetch each lesson page document (`/s/lessons/<id>`) so the worker stores it in `pages`.
  3. Warm media up to **20 MB per course**: lesson-file resources in lesson order, using the known `sizeBytes`. Files that would cross the budget are skipped and show "Not available offline".

  Each kept course gets a row in the Dexie `offlineCourses` table (`courseId`, `userId`, `openedAt`, `bytes`, `mediaUrls`, `lessonIds`). Opening the course again refreshes `openedAt` and re-warms only what changed.
- **Eviction**: before warming, and after a `QuotaExceededError`, check `navigator.storage.estimate()`. While usage is above 80 % of quota, evict the least-recently-opened course other than the current one: delete its media entries and lesson documents, and remove its lesson queries. The course itself stays listed. `navigator.storage.persist()` is requested once, after the app is installed.
- **Rationale**:
  - "Opened online" is the spec's trigger. Prefetching every assigned course would use data and storage the student never asked for.
  - The 20 MB budget and the LRU rule come straight from the spec.
- **Alternatives**:
  - Keeping all assigned courses: storage and mobile data.
  - A "Download" button: extra UI the spec doesn't ask for.
  - `router.prefetch` for lesson pages: in-memory only, not stored by the worker.

## R4. Persisted query cache in Dexie, one per user

- **Decision**: the root layout's `QueryProvider` stays as it is: under Cache Components it can't know who is signed in. The `/s` and `/a` layouts wrap their children in a client `PersistQueries({ userId })`, a `PersistQueryClientProvider` (`@tanstack/react-query-persist-client`) over the same browser `QueryClient`. Nesting it this way is supported, and its restoring state holds queries until the saved copy is back. It uses a small custom persister of three functions over the Dexie `queryCache` table, so no `idb-keyval` is needed.
  - Key: the user id, read from the `/s` or `/a` layout's `me` and passed in as a prop.
  - `buster`: the build id.
  - `maxAge`: 7 days.
  - Persisted: successful queries only. Admin queries are included, so Admins can read offline.
  - `gcTime` rises to 7 days so restored data isn't collected.
  - Routes outside `/s` and `/a` (auth pages) get no persister.
- **Rationale**:
  - FR-004 asks for this; the technical spec §7 already plans it.
  - Dexie is already required for the outbox, so the persister costs about 20 lines instead of a second IndexedDB wrapper.
  - A per-user key makes "another user never sees it" structural, not a filter.
- **Alternatives**:
  - `createAsyncStoragePersister` + `idb-keyval`: one more package and a JSON round-trip.
  - `experimental_createQueryPersister`: per-query, experimental.
  - `localStorage`: 5 MB limit, synchronous.

## R5. The outbox: Dexie table, one pending entry per record

- **Decision**: a Dexie database `studymate`, version 1, with tables `outbox`, `outboxFiles`, `queryCache` and `offlineCourses` (data-model.md › Device data). An outbox entry is `{ id (op id, uuid), userId, type, recordKey, payload, base, at, state, attempts, error }`. States are `pending`, `syncing`, `dropped`.
  - **Coalescing**: an entry is keyed by its record (e.g. `submission:<lessonId>`, `progress:<lessonId>`, `shift:<id>`). A new change to a record that has a `pending` entry replaces that entry's payload and keeps its `base` and first `at`. Exception: a submit keeps its own `at`, the press time.
    - A delete of a shift created offline removes both entries.
    - Complete-then-undo of the same lesson offline removes the entry.
  - **Order**: replay is FIFO by first enqueue time, one batch per sync.
  - **Rebase**: after an entry applies, later entries for the same record take the returned version as their `base`.
  - **Triggers**: sync runs on `online`, when the tab becomes visible, on app start, after an enqueue while online, and every 60 s while the outbox is not empty and the app is open. Background Sync is not used (no iOS support; the spec only needs sync "when online" with the app open).
- **Rationale**: one entry per record keeps the queue short (autosave would otherwise queue one entry per keystroke pause), makes "Will sync" a simple per-record lookup, and makes the server-wins rule apply to what the student last saw.
- **Alternatives**:
  - TanStack Query's paused mutations with `resumePausedMutations`: they serialise through the persister (no Blobs for photos), need every mutation registered with `setMutationDefaults`, and have no coalescing or per-record status.
  - An append-only log: more replays and more false conflicts.

## R6. Replay goes to one Route Handler, `POST /api/sync`

- **Decision**: the outbox replays through `POST /api/sync`. The body is `{ ops: Op[] }` in order, at most 50 per request. Each op is a discriminated union on `type` (contracts/sync-route.md).
  - The handler calls `requireRole('student')`, parses with Zod, and runs each op through its feature's `apply` function in order.
  - It returns one result per op: `applied` (with the new version), `duplicate` or `dropped` (with an error code).
  - Online writes keep their existing Server Actions. The outbox is used only when the device is offline, or when the Server Action call fails with a network error.
- **Rationale**:
  - Server Action ids are non-deterministic and change with every build (Next 15+). A queue written by yesterday's bundle and replayed after a deploy would call ids the new server doesn't know.
  - A plain URL with a Zod-validated body survives deploys and lets one request carry a batch.
  - The handler stays thin: guard, then parse, then the feature's `apply`.
  - Each feature's `apply` runs the same per-record guard (`requireLessonReader`) and the same repo function as its Server Action, so the rules have one source.
- **Alternatives**:
  - Replaying through Server Actions: breaks across deploys; Vercel skew protection keeps old deployments only for hours, while a phone can be offline for days.
  - Supabase from the client (the technical spec §10's first sketch): breaks constitution VII.
  - Sending every write through the outbox, online too: the forms would lose their inline errors (e.g. 005's overlap message), and it is a larger change to four features.

## R7. Idempotency and the server-wins rule, per operation

Every op carries its `id` (op id), the `base` it was made on and the device time `at`. On the server:

| Op | Base | Duplicate when | Dropped when (code) | Applied |
| --- | --- | --- | --- | --- |
| `progress.complete` / `progress.undo` | `wasDone` (boolean the student saw) | `lesson_progress.client_op_id = id` | lesson gone or unreadable (`lesson_unavailable`); done-state ≠ `wasDone` and ≠ target (`changed_on_server`); 004's own rules (`lesson_locked`, `submission_required`, `course_not_active`) | target state, `completed_at` = accepted `at` (R8), `client_op_id = id` |
| `submission.save` / `submission.submit` | `submissions.updated_at` seen (null = no row) | `submissions.client_op_id = id` | lesson unavailable; row's `updated_at` ≠ base, or status no longer Draft/Needs redo (`changed_on_server`); a referenced photo missing (`file_missing`) | draft saved, or submitted with `submitted_at` = accepted `at` |
| `focus.record` (session run offline) | – | `study_sessions.client_op_id = id` | lesson unavailable; overlaps another session (`focus_overlap`); length outside 1 min … planned | inserted finished session; lesson → In progress if Not started |
| `focus.stop` (started online, stopped offline) | session id | already ended (returns what it counted) | session gone (`session_not_found`) | `ended_at` = least(accepted `at`, cap) |
| `shift.save` (new) | – | `shifts.client_op_id = id` | overlap (`shift_overlap`), too long | created with `client_op_id = id` |
| `shift.save` (edit) | `shifts.updated_at` seen | `shifts.client_op_id = id` | shift gone (`shift_not_found`); `updated_at` ≠ base (`changed_on_server`); overlap | updated (005 rules), `client_op_id = id` |
| `shift.delete` | `shifts.updated_at` seen | shift already gone, or `client_op_id = id` (a rotation shift turned Off) | `updated_at` ≠ base (`changed_on_server`) | deleted, or turned Off for a rotation shift (005 rules) with `client_op_id = id` |

- **"Changed" means not equal, not "newer than"**: versions are always server time, set by the server. Equality avoids clock-skew bugs.
- **Lesson progress uses done-state, not `updated_at`**: `startFocus` and `focus.record` also bump `updated_at`, so the device's own queued focus session would make its own queued completion look like a conflict. Done-state is what the student saw and acted on. If the server already has the target state (completed on another device), the op is `applied` as a no-op and nothing is reported.
- **A deleted lesson** (spec edge case) fails `requireLessonReader` → `lesson_unavailable` → dropped and told.
- **Alternatives**:
  - Last-write-wins by timestamp (rejected in clarification Q2).
  - A per-op ledger table of applied ids: more schema. The `client_op_id` on the row covers the replay that matters, the last one; ops already superseded by a later change are caught by the version check.

## R8. Which device times the server accepts

- **Decision**: user-facing times (`completed_at`, `submitted_at`, a focus session's `started_at` / `ended_at`) take the op's `at` when `serverNow − 14 days ≤ at ≤ serverNow + 2 min`. A time slightly in the future (clock skew) is stored as `serverNow`. Outside that window, or earlier than the base version (FR-003c), server time is used. Versions (`updated_at`) are always server time.
- **Rationale**:
  - Honours "original timestamp" for streaks, daily counts and late-or-on-time.
  - Bounds how far a changed device clock can backdate a submission.
  - 14 days is longer than any realistic offline stretch and shorter than any course.
- **Alternatives**: always trust the device (backdating); always server time (breaks US2 scenarios 2–3).

## R9. Offline photos: Blobs in Dexie, uploaded before the draft

- **Decision**:
  - A photo added offline is resized and re-encoded by 004's `lib/image.ts` (≤ 2 MB, WebP or JPEG). It is stored in `outboxFiles` as `{ path, lessonId, blob, name, size }`. Its final Storage path `<studentId>/<lessonId>/<uuid>.<ext>` is chosen at once and goes into the draft payload's attachments.
  - On sync, the client uploads each file with 004's `upload.ts` (supabase-js Storage). An "already exists" answer counts as success, so the upload is idempotent. Then it sends the draft op.
  - The image strip shows the local Blob URL with a "Will sync" badge until the upload has finished.
  - At most 5 photos per draft and 10 MB per draft (004's limits).
- **Rationale**: uploads stay on the existing, RLS-protected path (constitution VII: supabase-js for Storage). The draft op only names paths the server can check with `isOwnSubmissionPath`.
- **Alternatives**:
  - Base64 inside the op body: about 33 % larger, and file bytes go through the app server.
  - Uploading through `/api/sync`: a second upload path to secure.

## R10. Auth while syncing

- **Decision**:
  - Every outbox and query-cache row carries `userId`, and sync only sends the signed-in user's rows.
  - A 401 from `/api/sync` or Storage pauses sync and shows "Sign in to sync your changes" in the offline banner's place. The rows stay.
  - When a different user signs in on the device, rows of any other user are deleted first, without sending.
  - supabase-js refreshes the access token on reconnect, as it already does.
- **Rationale**: an expired session must not lose work (the same user signs back in). Another user's data must never be sent with, or shown to, the new user.
- **Alternatives**: deleting on 401 (loses work over an expired token); syncing other users' rows (impossible without their session).

## R11. Sign-out wipes this device (FR-004a)

- **Decision**: Me → Sign out first counts the user's `pending` outbox entries. If there are any, it asks "{n} changes not synced yet — sign out anyway?". Cancel keeps the user signed in. On sign-out, `wipeOfflineData()` (in `src/lib/offline`):
  - deletes the Dexie database;
  - deletes the `pages`, `pages-rsc`, `pages-rsc-prefetch` and `media` caches, keeping the precache;
  - clears the in-memory query client.

  This runs before the existing `signOut` action and 006's push unsubscribe.
- **Offline sign-out**: the `signOut` Server Action can't be reached, so Me signs out locally instead: the wipe, then supabase-js `auth.signOut({ scope: 'local' })`, which clears the session cookies on this device. Then it goes to `/sign-in`, which the precache serves. The server-side session is left to expire. That is acceptable because the device no longer holds its tokens. 006's `unsubscribeThisDevice()` still runs first, so this phone stops showing that user's pushes. Its server row stays until a send to it fails with 404/410, which 006's dispatcher already handles by deleting the row (`push.ts`, `gone`).
- **Rationale**: per-user pages and media are cached by URL, so they can't be kept per user. Wiping is the clarified answer for shared phones.
- **Alternatives**: wiping only the user's rows (pages and media can't be split by user); silent wipe (rejected in Q3).

## R12. Install prompt (US1)

- **Decision**: an `InstallPrompt` in the `/s` and `/a` layouts.
  - **Visit**: an app open in a new browser session (no `sessionStorage` flag yet). It is counted in `localStorage.installVisits`.
  - **Chromium**: capture `beforeinstallprompt` and call `preventDefault()`. From the second visit, show a bottom sheet "Install StudyMate" with Install and Not now. Install calls `prompt()`.
  - **iPhone/iPad Safari, not standalone**: the same sheet shows steps instead (Share icon → Add to Home Screen → Add), with the Share glyph drawn from `lucide-react`.
  - **Not now**: hides it for 14 days (`localStorage.installDismissedUntil`).
  - **Never shown** when already standalone (`display-mode: standalone` or `navigator.standalone`), or when neither path applies (e.g. Firefox desktop).
  - Every `localStorage` access is wrapped in try/catch; private mode just shows nothing.
- **Standalone look (US1 scenario 3)**:
  - Manifest icons: 192, 512 and 512 maskable PNGs from the app mark, in `public/icons/`, plus `apple-touch-icon` (180).
  - `viewport-fit=cover` with `env(safe-area-inset-*)` padding on the tab bar, the top bars and the bottom sheets.
  - `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style: default`.
  - The status bar follows 007's `ThemeColorMeta` (Light/Dark).
  - Manifest `theme_color`/`background_color` stay the light background (the manifest can't follow the mode). `id: '/'`, `scope: '/'`, and `start_url: '/'` (the proxy sends each role home).
- **Alternatives**: the browser's own mini-infobar (Chrome only, no iOS); counting visits by calendar day (no clearer to test; "visited twice" reads as two sessions).

## R13. Update ready (US3)

- **Decision**:
  - `skipWaiting: false` and `clientsClaim: true` in `sw.ts`, so the first install takes control at once.
  - `UpdateToast` listens for a waiting worker (`registration.waiting`, `updatefound` → `installed`) and shows a persistent Sonner toast "Update ready" with a Reload action.
  - Reload first flushes the outbox, waiting at most 5 s. It then posts `SKIP_WAITING` and reloads on `controllerchange`.
  - Nothing reloads by itself, so an open editor is never interrupted.
- **Rationale**: matches the spec's "nothing reloads mid-edit". Flushing first means a reload never strands an entry that was mid-request.
- **Alternatives**: `skipWaiting: true` (the new worker serves new chunks to an old page, a known source of chunk-load errors); auto-reload when idle (still surprising).

## R14. What works offline, and what says why not

- **Queued**:
  - mark complete and undo;
  - draft save (text and photos) and Submit;
  - focus start, stop and auto-stop;
  - add, edit and delete of a single shift.
- **Disabled with a reason**: every other write. The button stays visible and disabled, with "Needs a connection" beneath it (`pwa.needsConnection`), through a shared `OnlineOnly` wrapper (`src/components/shared/online-only.tsx`) built on `useOnline`. That covers:
  - Admin editors and actions;
  - Notes;
  - rotation;
  - shift settings;
  - reminders;
  - account, appearance and language saves;
  - review.
- **Banner**: `OfflineBanner` in the `/s` and `/a` layouts. One line under the top bar, `role="status"`: "Offline — changes will sync", plus "{n} waiting" when the outbox has entries. It hides 2 s after reconnecting, once the outbox is empty. Admins see "Offline — showing saved data".
- **Not saved notice**: dropped entries show in a `DroppedChangesSheet`, opened from a toast "{n} changes weren't saved". Each item names the lesson or shift and the reason (`errors.*`). A dropped draft shows its text with Copy. Dismissing deletes the entries.
- **Alternatives**: hiding offline-impossible actions (the spec says "disabled with a reason"); queueing Notes (the clarifications scoped the queue to FR-003's list).

## R15. CSP and HTTPS (FR-006)

- **Decision**: `headers()` in `next.config.ts` sets the following on every route:

  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: <supabase>;
  font-src 'self';
  connect-src 'self' <supabase> wss://<supabase-host>;
  frame-src https://www.youtube-nocookie.com;
  worker-src 'self';
  manifest-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests
  ```

  It also sets `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`.
  - Push endpoints need no browser CSP entry: the browser's push service is contacted by the browser itself, and the server sends with `web-push`.
  - Vercel serves HTTPS only and redirects HTTP.
- **Why `'unsafe-inline'` for scripts**: nonces require every document to be rendered per request, which turns off Cache Components' static shells app-wide. Next's inline RSC payload scripts differ per page, so they can't be hashed. The 001 `lang` script and the 007 `appearance` script are fixed strings, but hashing only them doesn't help while Next's own inline scripts need `'unsafe-inline'`. Recorded in Complexity Tracking.
- **Alternatives**: nonce-based CSP (dynamic rendering everywhere; SC-002 and performance ≥ 90 at risk); no CSP (FR-006).

## R16. Testing offline

- **Unit (Vitest + `fake-indexeddb`)**, written before the code:
  - outbox coalescing and ordering;
  - rebase after apply;
  - `wasDone` handling;
  - the R8 time window (pure function);
  - eviction choice (pure function over `offlineCourses` rows and an estimate);
  - visit counting and the 14-day dismissal;
  - the persister round-trip.
- **Server (Vitest against the dev DB)**: each op's `apply` for applied, duplicate and each dropped code; the guard on `/api/sync` (401 signed out, 403 Admin, no access to another student's lesson).
- **pgTAP**: the new `submissions.client_op_id` is unique; `shifts.updated_at` exists and is not null; the existing student policies still refuse writes to another student's rows with these columns set.
- **Playwright** on a production build (the worker is off in dev): `context.setOffline(true)` covers page and worker. The specs are:
  - `us1-install` (manifest, icons, prompt after the second visit, 14-day dismissal; iOS sheet with a Safari user agent);
  - `us2-offline` (open a course online, go offline, read a lesson and an image, complete it, write a draft with a photo, submit, add a shift; back online → all synced with original times; plus one conflict dropped and shown);
  - `us3-update` (a waiting worker shows the toast; an open draft keeps its text). The waiting worker comes from restarting the server with a rebuild under a new `SW_REVISION` (R1).

  The spec's "push tapped while offline" edge case stays a manual check (quickstart.md §4 scenario 14): Playwright can't tap a real notification, and that path is the unchanged 006 handler plus R2's navigation fallback, both covered by `us2-offline`.

  Per the project memory, one smoke test per story during development and the full specs at the gate.
- **Lighthouse** (SC-001): Lighthouse 12 removed the PWA category. Installability is checked through Chrome's manifest and installability report, and `us1-install` asserts it with CDP `Page.getInstallabilityErrors`. Performance ≥ 90 on `/s/today` (mobile) is measured on the production build.
