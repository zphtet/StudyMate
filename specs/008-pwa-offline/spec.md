# Feature Specification: Installable PWA and Offline Use

**Feature Branch**: `008-pwa-offline`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: All; install prompt and offline banner are global UI.

## Clarifications

### Session 2026-11-24
- Q: When a student writes an assignment draft offline, can they also attach photos? → A: Yes — text and up to 5 photos (004's limits) are kept locally; photos upload on sync before the draft is saved.
- Q: When an offline change reaches the server and the server's copy changed meanwhile, which version wins? → A: The server wins; the offline change is dropped and the student is told what was not saved (draft text kept for copying).
- Q: What happens to offline data when someone signs out? → A: If changes are still waiting to sync, sign-out warns first; then all of that user's cached data, persisted queries and queue are deleted.
- Q: Offline, can a student press Submit on an assignment, or only save the draft? → A: Submit is queued ("Will submit"); on sync the draft saves, then submits with the original submit time.
- Q: Which shift actions work offline? → A: Add, edit and delete of a single shift are queued; rotation patterns are disabled offline with a reason.

## User Scenarios & Testing

### User Story 1 – Install on Android, iOS and desktop (Priority: P1)
**Independent Test**: Install from Chrome (Android, desktop) and Safari (iOS); app opens full-screen with its icon and name.

**Acceptance Scenarios**
1. **Given** Chrome/Edge supports install, **When** the user has visited twice, **Then** an "Install StudyMate" prompt appears (dismissable for 14 days).
2. **Given** iPhone Safari, **Then** a step-by-step "Share → Add to Home Screen" sheet is shown instead.
3. **Given** the installed app, **Then** it opens standalone, respects safe-area insets (notch, home bar) and colours the status bar with the Light or Dark background (007: the bar follows the mode, not the colour theme).

### User Story 2 – Study offline (Priority: P1)
**Acceptance Scenarios**
1. **Given** a student opened a course online, **When** offline later, **Then** that course's lessons, images and attachments (≤ 20 MB per course) are readable.
2. **Given** offline, **When** the student marks a lesson complete or writes an assignment draft, **Then** it is saved locally, shows "Will sync", and syncs automatically when online with the original timestamp.
3. **Given** offline, **When** the student submits an assignment, **Then** it shows "Will submit"; when online the draft saves and is submitted with the time the student pressed Submit (on time vs late is judged against that time).
4. **Given** offline, **Then** an unobtrusive banner says "Offline — changes will sync" to a student and "Offline — showing saved data" to an Admin (who has nothing to queue); admin editing actions that need the server are disabled with a reason.

### User Story 3 – Updates (Priority: P2)
**Acceptance Scenarios**
1. **Given** a new version is deployed, **When** the app is open, **Then** a toast "Update ready — Reload" appears; nothing reloads mid-edit.

### Edge Cases
- Conflict: a lesson completed offline was deleted by the admin meanwhile → sync drops it and tells the student.
- Conflict: the record changed on the server after the offline change was made (draft edited on another device, submission reviewed, shift edited elsewhere, lesson reopened) → the server version stays, the queued change is dropped, and the student sees a notice naming what was not saved; a dropped draft's text stays available to copy.
- A shift added offline overlaps a cached shift → blocked locally as online; one that only clashes on sync (shift added on another device) is dropped and reported under the server-wins rule.
- Signing out with unsynced changes → a confirm names how many will be lost; cancelling keeps the user signed in.
- Storage quota low → evict least-recently-opened courses first.
- Push notification tapped while offline → opens the cached lesson if available.

## Requirements

### Functional Requirements
- **FR-001**: Web app manifest (`app/manifest.ts`) with name, short name, icons (192/512 + maskable), `display: standalone`, theme and background colours.
- **FR-002**: Service worker (Serwist, disabled in `next dev`): the app shell opens with no network; pages and lesson data show the last saved copy at once and refresh when online (stale-while-revalidate); lesson media are served cache-first within the per-course budget.
- **FR-003**: Offline write queue in IndexedDB (Dexie) for: lesson complete/undo, submission drafts and submit, focus sessions, and add/edit/delete of a single shift; replayed in order with idempotency keys. Rotation patterns (005) are disabled offline with a reason.
- **FR-003a**: An offline submission draft keeps its Markdown and up to 5 photos (004 FR-003 limits, resized before storing) in IndexedDB; on sync the photos upload to Storage first, then the draft saves with their paths. Each photo shows "Will sync" until uploaded.
- **FR-003b**: Every queued change to an existing record carries the server version it was based on (a new shift or a focus session recorded offline has none); on replay, if the server record is gone or changed since then, the server wins and the change is reported to the student, never applied over it.
- **FR-003c**: Submit (Draft or Needs redo → Submitted) is queueable and keeps the original press time as `submitted_at`. The server accepts a client time only if it is not in the future and not earlier than the server version the change was based on; otherwise it uses server time.
- **FR-004**: TanStack Query persisted to IndexedDB so screens render instantly from cache.
- **FR-004a**: Sign-out deletes the user's offline data: persisted queries, cached lesson data and media, and the write queue. If the queue is not empty, sign-out first asks "n changes not synced yet — sign out anyway?".
- **FR-005**: The service worker handles `push` and `notificationclick` (feature 006) and deep-links to the target screen.
- **FR-006**: HTTPS-only hosting; CSP that allows only own origin, Supabase project and push endpoints.

## Success Criteria
- **SC-001**: Installable: Chrome's installability check reports no errors (Lighthouse 12 has no PWA category; constitution 2.1.0); Lighthouse performance ≥ 90 on mobile.
- **SC-002**: Cold start of installed app to usable Today screen < 2 s on a mid-range Android phone with cache.
- **SC-003**: 100% of offline-queued actions sync correctly in e2e tests (airplane-mode simulation).
