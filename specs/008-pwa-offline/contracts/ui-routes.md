# Contract: UI

008 adds no screens of its own, apart from `/~offline`. It adds global pieces to the `/s` and `/a` layouts and changes how some existing controls behave offline. No screenshot exists for these pieces, so they reuse existing components and tokens:
- `BottomSheet` (`components/shared/bottom-sheet.tsx`);
- Sonner toasts;
- the top-bar spacing of `04-Today.png`.

## Global pieces (`src/features/pwa/components/`)

Rendered by `src/app/s/layout.tsx` and `src/app/a/layout.tsx`, next to `AppearanceSync`.

| Piece | Shown when | Content (keys under `pwa.*`) | Notes |
| --- | --- | --- | --- |
| `OfflineBanner` | offline, or outbox not empty, or sync paused on 401 | Student offline: "Offline — changes will sync" + "{n} waiting". Admin offline: "Offline — showing saved data". Back online with entries: "Syncing {n}…". 401: "Sign in to sync your changes" + Sign in link | `role="status"`, one line under the top bar, `bg-muted`. Hides 2 s after the outbox empties. Never covers the tab bar |
| `InstallPrompt` | 2nd+ session, not standalone, not dismissed in the last 14 days, and either `beforeinstallprompt` fired or iOS Safari | Chromium: "Install StudyMate" / "Opens full-screen from your home screen" / Install / Not now. iOS: the same title plus 3 numbered steps with the Share and Plus-square icons / Got it / Not now | `BottomSheet`. Buttons ≥ 44 px. Not shown on auth pages, `/join` or `/~offline` |
| `UpdateToast` | a new worker is waiting | "Update ready" + Reload | Sonner, `duration: Infinity`. Reload waits for the outbox to flush (≤ 5 s) |
| `DroppedChangesSheet` | the outbox has `dropped` entries | Toast "{n} changes weren't saved" + View. The sheet lists each item's label, the reason (`errors.*`) and, for a draft, the text with Copy. OK clears them | Opened from the toast, or from the banner while entries remain |
| `SyncPill` (inline) | a record has a `pending` entry | "Will sync" (or "Will submit" for a queued Submit) | On the lesson's complete button, the assignment editor's status line, each pending photo, and a shift row or detail |

## Behaviour changes in existing screens

| Screen | Online (unchanged) | Offline |
| --- | --- | --- |
| `/s/courses/[courseId]` | as 002 | as 002, from the persisted cache. Opening it online also keeps it offline (R3). Lessons whose media didn't fit show "Not available offline" on the file row |
| `/s/lessons/[lessonId]` | as 004 | Content, images and attachments from cache. A YouTube embed shows "Video needs a connection". Mark complete / Undo are queued with a "Will sync" pill. Notes: read-only with "Needs a connection" |
| Assignment editor (004) | autosave → `saveDraft` | autosave → outbox `submission.save`. Add photo stores locally with "Will sync". Submit → `submission.submit` with "Will submit"; the editor turns read-only as when submitted |
| Focus timer (004) | Start/Stop → actions | runs on the device clock. Stop or auto-stop → `focus.record` (or `focus.stop` for a session started online) |
| `/s/shifts`, `/s/shifts/new`, `/s/shifts/[shiftId]` | as 005 | Save/Delete → outbox. Overlap is checked against cached shifts first, with a new pure `findLocalOverlap` in `features/shifts/overlap.ts` (the same rule as the repo's `findOverlap`: working shifts only, `start < other.end && end > other.start`). The server re-checks on sync |
| `/s/shifts/rotation`, shift settings, reminders, Me saves | as before | controls disabled with "Needs a connection" (`OnlineOnly`) |
| Every `/a/*` write (editors, assign, plan, rules, messages, review, notes, mark done/reopen) | as before | disabled with "Needs a connection" (`OnlineOnly`). Lists and details read from the persisted cache |
| Inbox and notification reads (mark read) | as 006 | marking read waits until online (no error); the bell shows the cached count |
| Me → Sign out (both roles) | signs out | if the outbox has entries: a confirm "{n} changes not synced yet — sign out anyway?" with Cancel / Sign out. Signing out wipes offline data first. Offline, the sign-out is local (supabase-js `signOut({ scope: 'local' })`) and goes to `/sign-in` (R11) |

## Controls that get `OnlineOnly`

Every component that runs a Server Action through `useMutation`, except the queued ones (`lesson-bottom-bar`, `assignment-editor`, `use-focus-timer`, `shift-editor`) and the auth forms (signed out, no persisted data):

| Feature | Components |
| --- | --- |
| alerts (Admin) | `composer.tsx`, `rule-editor.tsx`, `rule-row.tsx`, `scheduled-message-card.tsx` |
| assignments (Admin) | `assign-sheet.tsx`, `use-set-deadline.ts` (its callers' controls) |
| courses (Admin) | `admin-course-header.tsx`, `attachment-list.tsx` (edit mode), `course-card.tsx`, `course-form.tsx`, `course-lifecycle-items.tsx`, `delete-course-dialog.tsx`, `delete-lesson-sheet.tsx`, `lesson-edit-form.tsx`, `recently-deleted-view.tsx`, `section-header.tsx`, `sortable-lessons.tsx`, `use-autosave.ts` (pauses offline and says so) |
| notifications | `my-reminders.tsx`, `personal-reminder-sheet.tsx`, `quiet-hours-row.tsx`, `use-device-reminders.ts` (its toggle); `inbox.tsx` and `mark-read-on-open.tsx` wait instead (row above) |
| profile (both roles) | `account-view.tsx`, `edit-profile-sheet.tsx`, `use-appearance.ts` (its controls), `weekly-goal-sheet.tsx`; `me-view.tsx` keeps Sign out working offline (R11: wipe + local supabase-js sign-out) |
| progress | `lesson-review.tsx`, `review-bar.tsx` (Admin), `note-composer.tsx` (both) |
| shifts | `rotation-editor.tsx`, `shift-settings-sheet.tsx`, `week-check-card.tsx` |

A new mutation added later should use `OnlineOnly` unless it joins the outbox.

## Shared pieces

- `src/components/shared/online-only.tsx`: `<OnlineOnly>{(isOffline) => …}</OnlineOnly>` renders its child disabled offline, with the reason underneath (`aria-describedby`).
- `src/components/shared/use-online.ts`: unchanged.

## Accessibility and language

- Every new string is under `pwa.*` or `errors.*` in `en`, `my` and `ja`: about 35 keys. No pronouns for students.
- The banner is a polite live region. Sheets trap focus (existing `BottomSheet`). Icon-only controls have `aria-label`.
- At 390×844 the banner and sheets fit at Large text (007) in Burmese.
- Safe areas: the tab bar, the top bars and `BottomSheet` pad with `env(safe-area-inset-*)`. Nothing sits under the notch or home bar when standalone.
