# Research: Assigning Courses and Deadlines (003)

Phase 0 of the plan. Each item: decision, rationale, alternatives. Built on `prisma/migrations/0_init` (`course_assignments`, `lesson_deadlines`, `effective_due`, `busy_segments`, `next_free_at`, `notification_rules`, `notifications` and their RLS already exist), on 002 as built, and on the spec as clarified on 2026-11-21. Library versions checked against the npm registry on 2026-11-21.

## R1. Deadline status: a pure function in app code

- **Decision**: `deadlineStatus()` in `src/features/assignments/status.ts` returns `{ status, daysLate }` for one lesson, from: effective `dueAt` (or null), `done`, the 002 lock state, `now` and the student's time zone. It applies spec FR-005 in order: `done` → `overdue` → `due_soon` → `locked` → `upcoming` → `none`.
  - **overdue**: `now > dueAt` and not done. `daysLate` is the number of calendar days between the due date and today, both in the student's zone. 0 means "Overdue" (due earlier today); 1 or more means "N days late".
  - **due_soon**: `0 < dueAt − now ≤ 24 h`. The client labels it "Due today" or "Due tomorrow" from the due date in the viewer's zone.
  - **locked**: from 002's `computeLocks()` (reused, not copied).
  - **upcoming**: a deadline more than 24 h away.
  - **done**: `lesson_progress.status = 'done'`. 004 writes those rows; 003 tests insert them with the existing `markDone` fixture.
- The server computes statuses when it handles a request, with one `now`. It uses them for Today grouping, the Courses "N overdue" count and Plan colours. Queries refetch on mount and focus (`staleTime` 30 s), as in 002.
- **Rationale**: This resolves the constitution's open item for 003. 002 R1 put Open/Locked in app code, and its status chips reuse it. Status is a display rule, not an access rule, so no SQL is needed. It is unit-tested across time zones before the code exists (SC-002).
- **Alternatives**: a SQL function `lesson_status()`. Rejected: it would duplicate the lock rules (002 R1) and the calendar-day maths in SQL. A stored `status` column. Rejected: FR-005 says derived, never stored, and it would go stale every minute.

## R2. Effective deadline: one rule, two implementations, both tested

- **Decision**: Repos load a student's active assignments (`due_at`) and lesson deadlines in two queries. They combine them with `effectiveDue(lessonDeadline, courseDeadline)` = lesson ?? course ?? null (`src/features/assignments/status.ts`). The SQL `effective_due()` from 0_init stays the database definition, which 006 uses for reminders. pgTAP tests `effective_due` and a Vitest repo test checks that both give the same results for the same seeded rows.
- **Rationale**: Calling `effective_due()` once per lesson in lists is an N+1 pattern (CLAUDE.md › Data access). The rule is one line, and a test keeps the two in sync (FR-004).
- **Alternatives**: `$queryRaw` with `effective_due()` per row. Rejected: slower, and it leaves the typed Prisma path. A SQL view. Rejected: Today and the Plan also need the lock state and lesson order, which live in app code.

## R3. Time zones: `date-fns` + `@date-fns/tz`, helpers in `lib/time.ts`

- **Decision**: Add `date-fns` 4.4 and `@date-fns/tz` 1.5 (in the constitution's stack, not yet installed). New helpers in `src/lib/time.ts`, each unit-tested for Asia/Tokyo, Asia/Yangon (UTC+6:30), UTC and America/New_York:
  - `zonedToUtc(date: 'YYYY-MM-DD', time: 'HH:mm' | null, timeZone)`: no time means 23:59. A local time that doesn't exist (daylight-saving gap) moves forward to the next valid time (spec Edge Cases).
  - `utcToZoned(instant, timeZone)` → `{ date, time }` for form fields.
  - `calendarDaysBetween(earlier, later, timeZone)` for `daysLate`.
  - `moveToDay(instant, 'YYYY-MM-DD', timeZone)`: same local clock time on another day. It is used by drag and stays correct across daylight-saving changes.
  - `startOfLocalDay(date, timeZone)` / `localDayRange(date, timeZone)` for Plan days. A day is 23 or 25 h on a daylight-saving change, so bars are scaled to the day's real length.
  - `roundUpToLocalHour(instant, timeZone)`. Yangon's half-hour offset makes UTC rounding wrong.
  - `cityOf(timeZone)`: "Asia/Tokyo" → "Tokyo", for the Assign sheet and `TimeBoth` labels.
- Times cross the wire as ISO 8601 UTC strings (tech spec §7). The client turns the student-local inputs into an instant, and the server stores that instant. A later time-zone change by the student keeps the moment (clarification 2026-11-21).
- **Rationale**: These are the constitution's libraries, and `TZDate` handles IANA zones and daylight-saving gaps. Keeping the helpers in one module makes the time-zone rules testable in one place (constitution IV).
- **Alternatives**: bare `Intl` only. Rejected: no arithmetic and no DST-gap handling. Luxon or Temporal polyfill. Rejected: not in the stack.

## R4. Entering a deadline: native date + time inputs in the student's zone

- **Decision**: The `DueField` component (`src/features/assignments/components/due-field.tsx`) has a native `<input type="date">` and an optional `<input type="time">`, both read as **student-local** wall-clock values, plus a "No deadline" clear button. Under the fields, `TimeBoth` (`src/components/shared/time-both.tsx`, tech spec §12) shows "Tue 1 Dec, 23:59 (Tokyo) · 22:29 (Yangon)" when the zones differ. `TimeBoth` also has a `compact` variant, "21:00 · 19:30 yours", which the Plan uses on deadline cards and "Move to …" buttons whenever the Admin's zone differs from the student's (spec FR-008, constitution IV). Warnings appear inline: "Already overdue" for a past time, "Later than the course deadline" for a lesson deadline after it (clarification), and the shift/sleep clash (R7).
- **Rationale**: Native pickers are the most usable controls on phones, accessible by default, and need no new dependency. Splitting date and time gives the spec's "a date without a time means 23:59".
- **Alternatives**: `datetime-local`. Rejected: it can't express "date only". shadcn `Calendar` + time select. Rejected: heavier, and it adds `react-day-picker` for no gain.

## R5. Assign sheet: one Server Action, one transaction

- **Decision**: `saveAssignments` (contracts/server-actions.md) takes the whole sheet: one row per linked student (`assigned`, `dueAt`), plus `unlockInOrder`, `addDefaultReminders` and `notifyNow`. In one `prisma.$transaction`:
  1. Course must be the admin's own, `active` and not deleted, else `course_not_active`.
  2. Every student must be actively linked to the admin: one `studentLink.findMany`, and the count must match (new guard `requireAdminOfAll`).
  3. Ticked rows: upsert `course_assignments` on (`course_id`, `student_id`) with `status = 'active'`, `due_at`, `assigned_by = me`.
  4. Rows unticked that were active: set `status = 'removed'`. Progress, submissions and lesson deadlines are untouched (FR-007).
  5. `unlockInOrder` changed: run 002's rule rewrite. It is extracted from `updateCourse` (`src/features/courses/repo.ts`) into `applyUnlockInOrder(tx, courseId, on)` so both callers share it (DRY).
  6. Default reminders (R9) and notifications (R8) for the affected students.
- The sheet's Due fields start from each student's current deadline, or for unassigned students the course `target_date` at 23:59 in their zone, or "No deadline" (clarification 2026-11-21). The target date is never stored as a deadline.
- **Rationale**: One submit, all-or-nothing (tech spec §7: "multi-row changes use `prisma.$transaction`"). Upsert on the existing unique key gives "update, not duplicate" (US1 scenario 4) and "reassign restores" (FR-007) for free.
- **Alternatives**: one action per student. Rejected: partial failures leave half-assigned courses. Delete-on-unassign. Rejected: it loses the deadline history the spec keeps.

## R6. Deadline edits: two actions; drag and tap share them

- **Decision**: `setCourseDeadline({ courseId, studentId, dueAt | null })` updates the assignment's `due_at`. `setLessonDeadline({ lessonId, studentId, dueAt | null })` upserts or deletes the `lesson_deadlines` row (`set_by = me`); null removes it, and the lesson falls back to the course deadline. Drag, the "Move to …" button, the "+ Deadline" sheet and the tap-to-edit sheet all call these two actions. The client computes the new instant (`moveToDay`, R3), and the mutations update optimistically with rollback (tech spec §7).
- Guards: `requireAssignmentOwner(courseId, studentId)` and `requireLessonDeadlineTarget(lessonId, studentId)` (data-model.md › Guards). A lesson deadline needs a **Published**, non-deleted lesson in the admin's own course with an **active** assignment for that student (FR-003). Draft lessons are excluded because the Plan and students never show them (FR-006); a deadline set on one would vanish (clarification 2026-11-21).
- **Rationale**: A small write surface, and every entry point gets the same validation and notifications.
- **Alternatives**: a generic `moveDeadline(cardId, day)` that computes time on the server. Rejected: the client already has the student's zone, and two entry points would duplicate the maths.

## R7. Plan availability and clashes: `lib/availability.ts` over `busy_segments`

- **Decision**: The Plan endpoint calls `busy_segments(student, from, to)` through `prisma.$queryRaw` after `requireAdminOf` (docs/technical-spec.md §6.3; Prisma runs without a user token, which the function allows). A pure module `src/lib/availability.ts` (tech spec §3, shared with 005/006) then:
  - maps kinds for display: `shift` → **Shift**, `sleep` and `night` (outside waking hours) → **Sleep**, everything else → **Free**. `quiet` hours are a notification setting and are ignored here (spec: "shift or sleep").
  - `mergeSegments()`, then `freeGaps()` over a range;
  - `clashAt(segments, instant)` → `'shift' | 'sleep' | null`;
  - `suggestSlot(segments, after, minutes)`: the first free gap after `after` that is at least `minutes` long. It returns `roundUpToLocalHour(gapStart + minutes)`, capped at the gap end. It searches 7 days and returns null when nothing fits (no "Move" button then). `minutes` = the lesson's `est_minutes`, at least 60; course cards use 60.
- A clash is flagged only for deadlines that are not done and in the future (US4 scenario 2). The same check runs while picking a time in the Assign and deadline sheets, through `GET /api/admin/students/[studentId]/clash` (debounced 300 ms) (clarification 2026-11-21).
- **Rationale**: One definition of busy time in SQL (the one 005/006 rely on), and display logic in tested TypeScript. A suggestion right at the start of free time leaves the student no time to study, so it leaves room for the lesson. Spec FR-009 and the 2026-11-21 clarification state this rule.
- **Alternatives**: `next_free_at()` as the suggestion. Rejected: it also skips quiet hours and returns the first free minute, which leaves no study time. Computing busy time in TypeScript from `shifts` rows. Rejected: it would duplicate `busy_segments`.

## R8. Notifications are recorded now, delivered by 006

- **Decision**: `recordNotice()` in `src/server/notifications/record.ts` upserts a `notifications` row (spec FR-012), so 006 can extend one module.
  - **New course** (`notifyNow`): `source_type 'system'`, `source_id = courseId`, `occurrence_key 'assigned'`, url `/s/courses/<id>`, only for students newly assigned or reassigned in this save.
  - **Deadline set, changed or removed** after assignment, including a changed Due in the Assign sheet for an already assigned student: `source_id = lessonId | courseId`, `occurrence_key 'deadline'`, url to the lesson or course.
  - The upsert goes on the existing unique key (`source_type`, `source_id`, `user_id`, `occurrence_key`) and sets new `title`, `body` and `url`, `sent_at = now()` and `read_at = null`. One row per student and item, so repeated moves give one notice (clarification 2026-11-21). `source_id` is never null, because a null would defeat the unique key.
  - Text is rendered on the server in the **student's** `locale` (next-intl `getTranslations({ locale })`), with the due time formatted in the student's zone.
- Nothing is pushed in 003. 006 adds push delivery for new rows and the inbox screen.
- **Rationale**: The table and its de-dupe key already exist for this. Writing in the student's language is needed because the student reads the text later.
- **Alternatives**: an outbox table. Rejected: 006 owns delivery design, and `notifications` already acts as the inbox plus log.

## R9. Default reminders: rows in `notification_rules`, once per student

- **Decision**: With "Add default reminders" on, the action inserts, for each selected student who doesn't have them yet, the 006 FR-008 set: `daily` `{time:"20:00", days:[1..7]}`, `due_soon` `{offsets_h:[24,2]}`, `overdue` `{time:"19:00", max:3}`, `streak_risk` `{time:"21:30"}`. Each `config` also gets `"preset":"default"`. Messages are in the student's locale (keys `reminders.default.*`), with channels `{push, inapp}` and `enabled = true`. A partial unique index `notification_rules_default_once (admin_id, student_id, trigger) where config->>'preset' = 'default'` makes "at most once" hold even with two saves at once; inserts use `on conflict do nothing` (`createMany` + `skipDuplicates`).
- **Rationale**: FR-013 needs exactly-once. A database constraint is the reliable way (Postgres best practice), and the rows wait unused until 006's dispatcher runs.
- **Alternatives**: a check-then-insert in code only. Rejected: it races. Creating rules at 006 time. Rejected: the admin makes this choice when assigning.

## R10. Plan screen: data, URL state, drag

- **Decision**:
  - URL state: `/a/plan?student=<id>&week=<monday YYYY-MM-DD>&view=week|month`, so Back and reload work. The default is the first linked student by display name, and the current week in **the student's** zone (spec Assumptions).
  - Week data: `GET /api/admin/plan` returns 7 student-local days, each with display segments and cards. Cards are lesson deadlines plus **one card per course deadline** (US4 scenario 4), each with status, `daysLate`, clash and suggestion. Month data: `GET /api/admin/plan/month` returns counts and late counts per day.
  - Drag: `@dnd-kit/core` (already installed). Cards are draggables and day rows are droppables. The `TouchSensor` activates after a 250 ms press (long-press, so the page still scrolls), the `PointerSensor` after 6 px, and the `KeyboardSensor` (arrow keys move by day, Enter drops) covers FR-011. Done cards are not draggable. A drop calls R6's actions with `moveToDay(dueAt, targetDay, studentTz)`.
  - Tap: opens `DeadlineSheet` (change date and time, Remove). "+ Deadline" opens the same sheet with course and lesson pickers (Published lessons only).
  - Times: day rows and card times are in the student's zone. When the Admin's zone differs, the header says "Times in {city} time" and every card time and "Move to …" label adds the Admin's time with `TimeBoth` `compact` (spec FR-008).
- **Rationale**: dnd-kit is in the stack and in the project, and its sensors give long-press and keyboard drag without custom gesture code. URL state keeps the screen shareable and the back button honest.
- **Alternatives**: native HTML5 drag and drop. Rejected: no touch support on iOS. Local component state for selection. Rejected: it is lost on reload.

## R11. Student screens: extend 002's endpoints, add Today

- **Decision**:
  - `GET /api/courses` (002) gains `dueAt` (the course deadline) and `overdueCount` per active course.
  - `GET /api/courses/[courseId]` (002) gains `course.dueAt` and, per lesson, `done` and `due: { dueAt, status, daysLate } | null`.
  - New `GET /api/today` returns `{ overdue, dueToday }`: overdue oldest first, due today earliest first, all items. The client shows 5 per section, then "Show all (N)" (spec Edge Cases).
  - Chips reuse `StatusChip` with two new tones, `danger` and `warning`. Lesson rows get the detail line from contracts/ui-routes.md.
  - Only Published, non-deleted lessons of Active courses with an active assignment count (FR-006). Archived courses keep their 002 behaviour with no due chips.
- **Rationale**: Additive fields keep 002's contracts and tests valid. Today is a new screen with its own query key.
- **Alternatives**: a separate `/api/courses/[id]/deadlines`. Rejected: a second request for one screen.

## R12. Access rules: tighten `deadlines_write`; everything else exists

- **Decision**: 0_init's `assign_read` / `assign_write` already match the guards: owner of the course and linked student. `deadlines_write` only checks `is_admin_of(student_id)`. It is replaced by a hand-written policy that also requires the lesson to be Published and not deleted, in a course the caller owns, with an active assignment for that student. This mirrors `requireLessonDeadlineTarget` (constitution I: both layers apply the same rules). The `notifications` inserts come from server code (Prisma), so no insert policy is added.
- **Rationale**: Without the tighter rule, an admin with a user token could attach deadlines to any lesson id for their student.
- **Alternatives**: rely on the guard only. Rejected: constitution I requires RLS as the second layer.

## R13. Theme tokens

- **Decision**: `globals.css` gains semantic tokens defined from existing theme variables, so all 10 themes inherit them without per-theme values:
  - `--destructive-soft` (`color-mix(in oklch, var(--destructive) 14%, transparent)`) for red chips;
  - `--avail-shift` (`var(--primary)`), `--avail-sleep` (`var(--muted)`), `--avail-free` (`var(--success-soft)`) for `DayBar`.
  - Contrast tests extend 002's token check: legend and chip text ≥ 4.5:1 in light and dark.
- **Rationale**: Constitution V says tokens only, and 005 reuses `DayBar`.
- **Alternatives**: per-theme hex values. Rejected: 10 themes × 2 modes to maintain.

## R14. Dependencies

| Package | Version | Why |
| --- | --- | --- |
| `date-fns` | 4.4.0 | date arithmetic and formatting (constitution VII) |
| `@date-fns/tz` | 1.5.0 | `TZDate`, IANA zones, daylight-saving gaps (R3) |

Already present: `@dnd-kit/core` 6.3.1, shadcn `sheet`, `checkbox`, `dialog`. No other additions.

## R15. Tests

- **pgTAP** `supabase/tests/003_assign_policies.test.sql`: assignments read and write, allowed and denied, for student, own admin, other admin and unlinked; the new `deadlines_write` (lesson not in my course, Draft lesson, soft-deleted lesson, no active assignment, other admin → denied); `effective_due` (lesson over course, removed assignment → null); the default-rules partial unique index.
- **Vitest (unit)**: `lib/time.test.ts` (R3 helpers × 4 zones, midnight and DST edges), `assignments/status.test.ts` (FR-005 order, `daysLate`), `lib/availability.test.ts` (merge, gaps, clash, suggestion incl. Yangon rounding), `assignments/schemas.test.ts`.
- **Vitest (dev DB)**: guards (`requireAdminOfAll`, `requireAssignmentOwner`, `requireLessonDeadlineTarget`) with the same allowed and denied matrix as pgTAP. Repo tests: assign upsert, unassign keeps lesson deadlines, reassign restores, default rules once, notice upsert replaces unread, app `effectiveDue` = SQL `effective_due`.
- **Playwright** at 390×844 and 1280×800 with axe: `us1-assign`, `us2-deadlines` (drag, keyboard, tap edit), `us3-student-due` (Tokyo + Yangon students), `us4-plan` (seeded shifts, clash, move). Fixtures extend `tests/e2e/fixtures/courses.ts` with `setLessonDeadline`, `seedShift`.

## Sources
- `.specify/memory/constitution.md` 2.0.1; `docs/technical-spec.md` §3, §6.3, §7, §8, §9, §12, §13, §17; `docs/data-model.md` §3, §4, §5, §7.
- `prisma/migrations/0_init/migration.sql` (tables, `effective_due`, `busy_segments`, `next_free_at`, policies); `specs/002-courses-lessons/research.md` R1, R13.
- npm registry 2026-11-21: `date-fns` 4.4.0, `@date-fns/tz` 1.5.0, `@dnd-kit/core` 6.3.1.
