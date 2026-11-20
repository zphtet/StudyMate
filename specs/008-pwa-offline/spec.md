# Feature Specification: Installable PWA and Offline Use

**Feature Branch**: `008-pwa-offline`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: All; install prompt and offline banner are global UI.

## User Scenarios & Testing

### User Story 1 – Install on Android, iOS and desktop (Priority: P1)
**Independent Test**: Install from Chrome (Android, desktop) and Safari (iOS); app opens full-screen with its icon and name.

**Acceptance Scenarios**
1. **Given** Chrome/Edge supports install, **When** the user has visited twice, **Then** an "Install StudyMate" prompt appears (dismissable for 14 days).
2. **Given** iPhone Safari, **Then** a step-by-step "Share → Add to Home Screen" sheet is shown instead.
3. **Given** the installed app, **Then** it opens standalone, respects safe-area insets (notch, home bar) and uses the theme colour for the status bar.

### User Story 2 – Study offline (Priority: P1)
**Acceptance Scenarios**
1. **Given** a student opened a course online, **When** offline later, **Then** that course's lessons, images and attachments (≤ 20 MB per course) are readable.
2. **Given** offline, **When** the student marks a lesson complete or writes an assignment draft, **Then** it is saved locally, shows "Will sync", and syncs automatically when online with the original timestamp.
3. **Given** offline, **Then** an unobtrusive banner says "Offline — changes will sync"; admin editing actions that need the server are disabled with a reason.

### User Story 3 – Updates (Priority: P2)
**Acceptance Scenarios**
1. **Given** a new version is deployed, **When** the app is open, **Then** a toast "Update ready — Reload" appears; nothing reloads mid-edit.

### Edge Cases
- Conflict: a lesson completed offline was deleted by the admin meanwhile → sync drops it and tells the student.
- Storage quota low → evict least-recently-opened courses first.
- Push notification tapped while offline → opens the cached lesson if available.

## Requirements

### Functional Requirements
- **FR-001**: Web app manifest (`app/manifest.ts`) with name, short name, icons (192/512 + maskable), `display: standalone`, theme and background colours.
- **FR-002**: Service worker (Serwist via `@serwist/next`, disabled in `next dev`): app shell precache; runtime cache for lesson data (stale-while-revalidate) and media (cache-first, size-limited).
- **FR-003**: Offline write queue in IndexedDB (Dexie) for: lesson complete/undo, submission drafts, focus sessions, shift edits; replayed in order with idempotency keys.
- **FR-004**: TanStack Query persisted to IndexedDB so screens render instantly from cache.
- **FR-005**: The service worker handles `push` and `notificationclick` (feature 006) and deep-links to the target screen.
- **FR-006**: HTTPS-only hosting; CSP that allows only own origin, Supabase project and push endpoints.

## Success Criteria
- **SC-001**: Lighthouse: installable, PWA checks pass; performance ≥ 90 on mobile.
- **SC-002**: Cold start of installed app to usable Today screen < 2 s on a mid-range Android phone with cache.
- **SC-003**: 100% of offline-queued actions sync correctly in e2e tests (airplane-mode simulation).
