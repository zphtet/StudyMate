---
description: "Tasks for 005 Shift Calendar and Availability"
---

# Tasks: Shift Calendar and Availability

**Input**: Design documents from `specs/005-shifts/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**:
- plan.md and spec.md (clarified 2026-11-22; four planning edge cases added).
- 001–004 merged on `main`: `busy_segments`, `status_at` / `status_now`, `lib/availability.ts`, `DayBar`, `CalendarMonth`, 004's `getStudentCards`, the e2e fixtures `linkStudent` and `seedShift`, 002's cron pattern (`/api/cron/purge`, `CRON_SECRET`).
- 001's linking UI is **not** required: tests link students with `linkStudent()`.
- Notifications and SC-003 (006), offline edits (008) and the quiet-hours UI (006) are out of scope.

**Tests**: Required by constitution III (test-first):
- pgTAP for database rules;
- Vitest for logic, schemas and repos, written and failing before the code; `fast-check` properties for SC-002;
- Playwright per user story at 390×844 and 1280×800 with axe, run against a production build on :3100 (leave the dev server on :3000 alone).

**Organization**: Grouped by user story in priority order: US1, US4 (P1), then US2, US3 (P2).
- **US1** builds the Shifts screen (calendar), the shift editor, the settings sheet.
- **US4** adds the live status line to the Admin's student cards (the Plan bars are 003's and need only a test).
- **US2** adds rotations, their daily top-up and the Sunday check.
- **US3** adds the day timeline, the Today banner and the Me row.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths follow plan.md › Project Structure. Field rules cite `data-model.md` (`Entity.field`) instead of repeating them.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: database precondition and one shared move. Branch `005-shifts` already exists.

- [X] T001 Check the dev database precondition for the migration on `DIRECT_URL` (quickstart.md §2): `select count(*) from shift_patterns` must be 0 (data-model.md ShiftPattern.presets is dropped) and `select count(*) from shifts where type = 'off' and sleep_minutes > 0` must be 0 (data-model.md Shift.sleep_minutes new CHECK). If either isn't 0, stop and report. (2026-11-22: 0 and 0.)
- [X] T002 Move `getBusySegments` from src/features/assignments/plan-repo.ts to src/server/availability.ts (research R7; second user is 005) and update its callers in src/features/assignments/plan-repo.ts. No behaviour change; 003's plan-repo tests and `us4-plan` still pass. Commit on its own.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migration, time helper, schemas, query keys, theme tokens, fixtures. Every story depends on this phase.

**⚠️ CRITICAL**: no user story work starts until this phase is complete

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [X] T003 [P] Write pgTAP tests in supabase/tests/005_shift_policies.test.sql (research R1, R12), wrapped in `begin … rollback`, switching users with `set local role authenticated` and `request.jwt.claims` as in 004_progress_policies.test.sql. Cases:
  - **CHECK**: an Off shift with `sleep_minutes > 0` is refused (data-model.md Shift.sleep_minutes); an Off day overlapping a working shift is allowed (data-model.md Shift.type).
  - **Index**: a second active rotation for one student is refused; an inactive one is allowed (data-model.md ShiftPattern.active).
  - **Columns**: `profiles.shift_presets` has the default and `profiles.shifts_confirmed_week` is null for a new profile (data-model.md Profile.shift_presets, Profile.shifts_confirmed_week); `shift_patterns` has `generated_until` and no `presets` (data-model.md ShiftPattern.generated_until).
  - **busy_segments**: an Off day gives no `shift` and no `sleep` row.
  - **RLS** `shifts` and `shift_patterns`: the student inserts, updates, deletes own rows and can't write another student's; the linked Admin reads but can't insert, update or delete; an unlinked Admin and another student read nothing (FR-008).
- [X] T004 [P] Write unit tests for `shiftInstants({ date, start, end }, timeZone)` in src/lib/time.test.ts (research R2; data-model.md Shift.start_at, Shift.end_at):
  - same-day 09:00–18:00 is 9 h;
  - 22:00–07:00 ends the next local date, 9 h;
  - `end = start` is 24 h;
  - Tokyo, Asia/Yangon (+06:30), and New York across 1 Nov 2026 (22:00–07:00 is 10 h; 08:00–08:00 is 25 h);
  - Off: the whole local day.
- [X] T005 [P] Write unit tests in src/features/shifts/schemas.test.ts for every schema in contracts/server-actions.md › Field schemas: clock times, `shiftType`, `saveShift` (times required unless Off), `sequence` (D/E/N/O only, 1–28, at least one working letter → `rotationEmpty`), presets (same start and end → `presetSameTimes`), `sleepMinutes` 240–720 in steps of 30, waking order (`wakingOrder`), uuids.
- [X] T006 [P] Add `fast-check` property tests to src/lib/availability.test.ts (SC-002; research R12): for random lists of non-overlapping overnight and back-to-back shifts with sleep blocks, `mergeSegments(displaySegments(…))` is ordered and disjoint, `freeGaps` plus the segments cover the range exactly, and no free window lies inside a shift or sleep block. (Rotation-generated shifts are added in T036.)

### Implementation

- [X] T007 Edit prisma/schema.prisma:
  - `Profile.shiftPresets Json @map("shift_presets")` with the default from data-model.md Profile.shift_presets, and `Profile.shiftsConfirmedWeek DateTime? @map("shifts_confirmed_week") @db.Date`;
  - `ShiftPattern.generatedUntil DateTime? @map("generated_until") @db.Date`; remove `ShiftPattern.presets` (data-model.md ShiftPattern.presets).

  Generate prisma/migrations/<UTC timestamp>_shifts/migration.sql with `prisma migrate diff` against the committed schema (docs/data-model.md §7). Then add by hand (data-model.md › Migration items 1–2): the CHECK `shifts_off_no_sleep` (data-model.md Shift.sleep_minutes) and the partial unique index `shift_patterns_one_active` (data-model.md ShiftPattern.active). Never drop SQL-only objects. (Done 2026-11-22 as `20261122132950_shifts`, plus `20261122133349_shifts_off_day`, which replaces 0_init's 24 h CHECK so an Off day can be 25 h on a fall-back day; found by T013.)
- [X] T008 Apply and verify: `pnpm prisma migrate deploy`, `pnpm prisma generate`, `pnpm test:db`. T003 passes and the 001–004 and `005_status_now` pgTAP files still pass.
- [X] T009 [P] Implement `shiftInstants` in src/lib/time.ts (research R2; data-model.md Shift.start_at, Shift.end_at) using `@date-fns/tz`; fix the docs/technical-spec.md line that already names it. T004 passes.
- [X] T010 [P] Create src/features/shifts/schemas.ts with all schemas from contracts/server-actions.md (data-model.md Shift.type, ShiftPattern.sequence, Profile.shift_presets, Profile.sleep_minutes, Profile.waking_start, Profile.waking_end). The rotation editor narrows ShiftPattern.sequence to D/E/N/O (research R4). T005 passes.
- [X] T011 [P] Create src/features/shifts/types.ts (`ShiftView`, `Segment`, `ShiftSettings` from contracts/route-handlers.md › Shared types; Prisma-derived where possible) and src/features/shifts/queries.ts with the key factory `['shifts','month',month]`, `['shifts','detail',id]`, `['shifts','settings']`, `['shifts','today']` (contracts/server-actions.md › Query invalidation). No `queryOptions` yet; stories add them.
- [X] T012 [P] Add the theme tokens `--shift-day`, `--shift-evening`, `--shift-night`, `--shift-custom` and their `-foreground` pairs for every theme and mode in src/app/globals.css (research R5), the Tailwind `bg-shift-*` / `text-shift-*` mappings, and the pairs to src/app/theme-contrast.test.ts (≥ 4.5:1).
- [X] T013 [P] Extend the e2e fixtures in tests/e2e/fixtures/courses.ts:
  - `seedShift` accepts `type: 'off'` (whole local day, `sleepMinutes` 0), `patternId` and `overridden` (data-model.md Shift.pattern_id, Shift.overridden);
  - `seedRotation(studentId, { sequence, startDate, generatedUntil? })` (data-model.md ShiftPattern.sequence, ShiftPattern.start_date);
  - `setShiftSettings(studentId, { presets?, sleepMinutes?, wakingStart?, wakingEnd?, confirmedWeek? })`.

  Rows cascade with their users, so tests/e2e/global-teardown.ts needs no change; check that.

**Checkpoint**: migration applied and tested, `shiftInstants` and schemas tested, tokens and fixtures ready. Stories can start.

---

## Phase 3: User Story 1 – Student adds a shift, including overnight (Priority: P1) 🎯 MVP

**Goal**: students add, edit and delete shifts (Day, Evening, Night, Off, Custom) from presets, with an optional sleep block; overnight shifts are one record and show joined across days in the month calendar; presets, sleep length and waking hours are editable.

**Independent Test**: add a Night shift 22:00–07:00 on a Friday in three taps (Add shift, Night, Save shift): Fri shows "22→" and Sat "→07", joined; the database has one row. Adding a Day shift 06:00–10:00 on Saturday fails with "Overlaps your shift Fri 22:00–07:00".

### Tests for User Story 1 (write first, see them fail)

- [X] T014 [P] [US1] Write unit tests for `monthChips(shifts, timeZone, month)` in src/features/shifts/calendar.test.ts (research R5): a same-day chip "9–18"; an overnight shift gives "22→" (`joinsNext`) and "→07" (`joinsPrev`); across a Sunday→Monday row break; across a month boundary; Off; a shift seen in another zone (Yangon) moves to the right local dates.
- [X] T015 [P] [US1] Write tests against the dev database in src/features/shifts/repo.test.ts (research R2; data-model.md Shift.student_id, Shift.type, Shift.start_at, Shift.end_at, Shift.sleep_minutes, Shift.overridden, Shift.pattern_id):
  - `saveShift` stores one row for an overnight shift in the student's zone;
  - Off is the whole local day with no sleep and can share a day with a working shift;
  - Block sleep stores data-model.md Profile.sleep_minutes, off stores 0;
  - an overlapping working shift fails `shift_overlap` with the clashing start and end; a forced race (insert bypassing the check) maps SQLSTATE `23P01` to the same code;
  - a 25 h New York fall-back shift fails `shift_too_long`;
  - editing a generated shift sets `overridden`; deleting a generated shift leaves an overridden Off row; deleting a hand-entered one removes it;
  - another student's id → `shift_not_found`;
  - `getMonthShifts` returns the month ±1 day and merged segments; changing the profile zone keeps the instants (Edge Cases);
  - `saveShiftSettings` stores data-model.md Profile.shift_presets, Profile.sleep_minutes, Profile.waking_start, Profile.waking_end and leaves Profile.after_shift_buffer, Profile.quiet_start, Profile.quiet_end untouched.
- [X] T016 [P] [US1] Write Playwright tests in tests/e2e/us1-shifts.spec.ts (390×844 and 1280×800, axe):
  - scenario 1: each preset fills its times; Custom keeps the times; Off hides them;
  - scenario 2: Night shows "+1 day" and "9 h · crosses midnight, ends the next morning";
  - scenario 3 and SC-001: Add shift → Night → Save shift (3 taps) shows "22→"/"→07" joined; a Sunday night joins across the row break; one row in the database;
  - scenario 4: Block sleep is on for Night with "No reminders until 15:30 Sat (8 h)";
  - Edge Cases: the overlap message; edit and delete a shift;
  - Settings: Night set to 21:00–06:00 fills the next Night with 21:00–06:00.
  - Roles (constitution I, III): signed in as an Admin, `GET /api/shifts` and `GET /api/shifts/settings` return 403 `forbidden` (as us4-student-reads.spec.ts checks its 403s) and `/s/shifts` doesn't render for them.

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `monthChips` in src/features/shifts/calendar.ts (research R5). T014 passes.
- [X] T018 [US1] Repo in src/features/shifts/repo.ts (research R2, R3, R10): `saveShift` (overlap lookup naming the clashing shift inside the transaction, `23P01` mapping, edit of a generated shift sets data-model.md Shift.overridden), `deleteShift` (generated → overridden Off row), `getMonthShifts` (shifts of the month ±1 day + `getBusySegments` from src/server/availability.ts, merged), `getShift`, `getShiftSettings` (data-model.md Profile.after_shift_buffer is returned read-only), `saveShiftSettings` (data-model.md Profile.shift_presets, Profile.sleep_minutes, Profile.waking_start, Profile.waking_end; data-model.md Profile.after_shift_buffer, Profile.quiet_start, Profile.quiet_end are left untouched). Every write sets data-model.md Shift.student_id from the caller and every lookup matches `{ id, studentId }`. Data-model.md Shift.client_op_id stays unset (008). T015 passes.
- [X] T019 [US1] Server Actions `saveShift`, `deleteShift`, `saveShiftSettings` in src/features/shifts/actions.ts (contracts/server-actions.md; `requireRole('student')` first; data-model.md Shift.student_id from the guard, never from input). Route Handlers GET src/app/api/shifts/route.ts (`?month=`), src/app/api/shifts/[shiftId]/route.ts, src/app/api/shifts/settings/route.ts (contracts/route-handlers.md) and their `queryOptions` in src/features/shifts/queries.ts.
- [X] T020 [P] [US1] Components in src/features/shifts/components/ (contracts/ui-routes.md): `ShiftChip` (tokens from T012), `ShiftTypePicker` (shadcn `toggle-group` as a radio group, 44 px tiles), `ShiftCalendar` (003's `CalendarMonth` with chips in the badge slot, month navigation in `?month=`, legend of the month's types, accessible day names with their shifts). Joining "22→" and "→07" across the cell border and the row break needs the chip to reach the cell edge, which the current `rounded-xl` centred cell in src/components/shared/calendar-month.tsx doesn't allow: add the smallest opt-in prop there (e.g. a full-width badge row), keep its defaults unchanged, and check that 003's Plan and 004's progress calendar tests still pass. (Done: no prop was needed; the chips use negative margins in the badge slot, and the shared cell got `align-top` so days with more chips don't shift the day numbers of their row.)
- [X] T021 [US1] Replace the placeholder in src/app/s/(tabs)/shifts/page.tsx with the Shifts screen (07-Shifts.png): header and **Add shift**, `ShiftCalendar`, selected day in `?day=`, the **Shift settings** row, and the empty state. Prefetch the month on the server with `HydrationBoundary` as 004's pages do.
- [X] T022 [US1] Shift editor at src/app/s/shifts/new/page.tsx and src/app/s/shifts/[shiftId]/page.tsx with `ShiftEditor` in src/features/shifts/components/shift-editor.tsx (08-ShiftEdit.png; contracts/ui-routes.md): type picker filling from presets, Starts / Ends with "+1 day", the 48 h strip and duration line from `shiftInstants`, **Repeat: Just this day** (My rotation arrives in T045), Block sleep card, inline errors, Delete with confirm (shadcn `alert-dialog`), `useMutation` + `useErrorMessage`, invalidating per contracts/server-actions.md.
- [X] T023 [US1] Shift settings sheet in src/features/shifts/components/shift-settings-sheet.tsx (research R10): preset times for Day / Evening / Night, sleep length 4–12 h in 30 min steps, waking hours; one Zod schema with the action (T010).
- [X] T024 [US1] Add the `shifts`, `shiftEditor` and `shiftSettings` strings and `errors.shift_overlap`, `errors.shift_too_long`, `errors.shift_not_found`, `validation.timeInvalid`, `validation.presetSameTimes`, `validation.wakingOrder` to src/i18n/messages/en.json, my.json and ja.json.
- [X] T025 [US1] Run T014–T016 until they pass.

**Checkpoint**: US1 works on its own (MVP for students).

---

## Phase 4: User Story 4 – Admin sees availability (Priority: P1)

**Goal**: each linked student's card on the Admin's Students tab shows a live status, in the student's time with the Admin's beside it; the Plan bars (003) reflect the shifts students enter.

**Independent Test**: seed a night shift running now for a linked student: the card says "On night shift until 07:00 · … yours"; with a sleep block running, "Sleeping until 15:30"; otherwise "Free now"; a student with no shifts says "No shift info". When the shown time passes, the line changes without a reload.

### Tests for User Story 4 (write first, see them fail)

- [X] T026 [P] [US4] Write unit tests for the status text in src/features/shifts/status-text.test.ts (research R8): on_shift with the shift type, sleeping, free, unknown; the student's local time first and "· {time} yours" only when the zones differ; a weekday when the change is more than a day away; `until` null.
- [X] T027 [P] [US4] Write tests against the dev database for `getStudentCards` status in src/features/progress/admin-repo.test.ts (research R8): `state`, `until` and `shiftType` per student for a running shift, a sleep block, free and no shifts; the statuses come from one added SQL statement for 10 students (Prisma query log as in 004's T082 check); an unlinked student never appears.
- [X] T028 [P] [US4] Write Playwright tests in tests/e2e/us4-availability.spec.ts (390×844 and 1280×800, axe): scenario 1 (on shift, sleeping, free, each with the Admin's time in Yangon beside the student's in Tokyo), scenario 2 (the Plan week shows the seeded shift and sleep bars for that student), scenario 3 ("No shift info"); the line updates when `until` passes (seed a shift ending in ~20 s).

### Implementation for User Story 4

- [X] T029 [P] [US4] Implement the status text in src/features/shifts/status-text.ts as a pure function plus a small hook that formats with next-intl. T026 passes.
- [X] T030 [US4] Extend `getStudentCards` in src/features/progress/admin-repo.ts with one statement: `status_now(student)` per linked student through a lateral join, plus the type of the shift running now (research R8); add `status` to `AdminStudentCard` in src/features/progress/types.ts (contracts/route-handlers.md › Admin). T027 passes.
- [X] T031 [US4] Show the status line under the name in src/features/progress/components/student-progress-card.tsx, and refetch the cards query when the earliest `until` passes (a timer, cleared on unmount) and on window focus.
- [X] T032 [US4] Add the `availabilityStatus` strings to src/i18n/messages/en.json, my.json and ja.json.
- [X] T033 [US4] Run T026–T028 until they pass.

**Checkpoint**: US1 and US4 work: the P1 slice of 005.

---

## Phase 5: User Story 2 – Repeating rotation (Priority: P2)

**Goal**: a rotation generates shifts 8 weeks ahead and a daily cron keeps the horizon; edited days stay; changing or deleting a rotation replaces only its untouched future shifts; the Sunday check asks the student to confirm next week.

**Independent Test**: save D D D O N N O O from next Monday: 8 weeks of shifts appear with sleep after Nights. Edit one generated day, change the rotation to D D O O: the edited day and past days stay, the rest follow the new pattern. On Sunday after 18:00, Today and Shifts show "Next week's shifts — correct?" until Confirm.

### Tests for User Story 2 (write first, see them fail)

- [X] T034 [P] [US2] Write unit tests for `rotationDays(pattern, presets, timeZone, from, to)` in src/features/shifts/rotation.test.ts (research R4; data-model.md ShiftPattern.sequence, ShiftPattern.start_date, Profile.shift_presets): letters map by day offset from the start date; O gives nothing; Night carries sleep; a start date in the past continues the cycle from today; New York daylight-saving week; 28-letter sequences.
- [X] T035 [P] [US2] Write unit tests for `weekCheck({ now, timeZone, confirmedWeek, hasShifts })` in src/features/shifts/week-check.test.ts (research R9; data-model.md Profile.shifts_confirmed_week): not due before Sunday 18:00 local; due from 18:00 until Monday 00:00; not due when next Monday is confirmed; not due when `hasShifts` is false (FR-009); Tokyo and New York.
- [X] T036 [P] [US2] Add rotation-generated shifts to the `fast-check` properties in src/lib/availability.test.ts (SC-002).
- [X] T037 [P] [US2] Write tests against the dev database in src/features/shifts/rotation-repo.test.ts (research R4; data-model.md ShiftPattern.active, ShiftPattern.generated_until, Shift.pattern_id, Shift.overridden):
  - saving generates today → today + 56 and sets `generated_until`;
  - a day is skipped and reported in `skippedDays` when it has a hand-entered working shift that doesn't overlap the generated one (Day 09–18 vs a generated Night), a hand-entered Off, or an overridden shift; a working shift overlapping from the previous evening also skips it;
  - after a change, a day the student deleted from the old rotation (an overridden Off row with the old `pattern_id`) stays Off;
  - a change deletes only the old rotation's non-overridden shifts that haven't started (`start_at > now`) and generates the new one, skipping shifts that would start at or before now; a running generated shift and past rows stay unchanged and keep their `pattern_id`;
  - delete removes untouched shifts that haven't started and deactivates;
  - a second active rotation can't exist;
  - changing presets or sleep length regenerates future untouched shifts (Edge Cases);
  - the cron top-up extends to today + 56 and a second run inserts 0;
  - `confirmShiftWeek` stores next Monday.
- [X] T038 [P] [US2] Write Playwright tests in tests/e2e/us2-rotation.spec.ts (390×844 and 1280×800, axe): scenario 1 (save a rotation; 8 weeks shown), scenario 2 (an edited day survives a change), scenario 4 (change and delete), the deleted generated day stays Off, "Kept your own shifts on 1 day"; scenario 3 with the student's clock set to Sunday 19:00 (`page.clock`): the card shows on Today and Shifts, Confirm hides it after reload and in a second browser context, Edit hides it and opens next Monday; a student with no shifts sees no card. **Repeat: My rotation** on a Night shift opens the rotation editor with that date and N, without saving a shift; it is disabled for Custom. `GET /api/cron/rotations` returns 401 without the secret and with a wrong one (as us3-delete-restore.spec.ts does for the purge).

### Implementation for User Story 2

- [X] T039 [P] [US2] Implement `rotationDays` in src/features/shifts/rotation.ts (research R4). T034 passes.
- [X] T040 [P] [US2] Implement `weekCheck` in src/features/shifts/week-check.ts (research R9). T035 passes.
- [X] T041 [US2] Repo in src/features/shifts/rotation-repo.ts (research R4): `saveRotation` and `deleteRotation` in one transaction each, `regenerateFuture(student)` (used by both and by `saveShiftSettings`; deletes only non-overridden shifts with `start_at > now`), `topUpRotations(now)` for the cron, the bulk insert that skips the days in data-model.md › Lifecycles (hand-entered or overridden shift of any type and any rotation starting that date, an overlapping working shift, or a start at or before now) (data-model.md ShiftPattern.student_id from the guard, ShiftPattern.active, ShiftPattern.generated_until, ShiftPattern.start_date, Shift.pattern_id, Shift.overridden), and `confirmShiftWeek` (data-model.md Profile.shifts_confirmed_week). T037 passes.
- [X] T042 [US2] Server Actions `saveRotation`, `deleteRotation`, `confirmShiftWeek` in src/features/shifts/actions.ts; `saveShiftSettings` now calls `regenerateFuture` when presets or sleep length change (contracts/server-actions.md).
- [X] T043 [US2] Route Handler GET src/app/api/cron/rotations/route.ts (`CRON_SECRET` in constant time, as src/app/api/cron/purge/route.ts) calling `topUpRotations`; add the daily entry to vercel.json. Route Handler GET src/app/api/shifts/today/route.ts returning `weekCheck` (from `weekCheck({ …, hasShifts })`, so it is never due for a student without shifts) and `hasShifts` (the banner fields arrive in T052) and its `queryOptions`.
- [X] T044 [US2] Rotation editor at src/app/s/shifts/rotation/page.tsx with `RotationEditor` in src/features/shifts/components/rotation-editor.tsx (contracts/ui-routes.md): letter tiles, + Day/Evening/Night/Off, Starts on (`?start=` when opened from the shift editor, with `?type=` as the first letter of a new pattern), 14-day preview from `rotationDays`, Save (with the skipped-days note), Delete with confirm.
- [X] T045 [US2] Wire rotations into the screens: the **My rotation** row on src/app/s/(tabs)/shifts/page.tsx; the **Repeat: My rotation** option in src/features/shifts/components/shift-editor.tsx (Save doesn't store the shift; it opens `/s/shifts/rotation?start={date}&type={D|E|N|O}`; disabled for Custom; contracts/ui-routes.md); the generated-shift delete confirm text.
- [X] T046 [US2] `WeekCheckCard` in src/features/shifts/components/week-check-card.tsx, shown on the Shifts screen and in src/features/assignments/components/today-view.tsx when due; optimistic `['shifts','today']` update; Edit navigates to `/s/shifts?month=…&day={next Monday}`.
- [X] T047 [US2] Add the `rotation` and `weekCheck` strings and `errors.rotation_not_found`, `validation.rotationEmpty` to src/i18n/messages/en.json, my.json and ja.json.
- [X] T048 [US2] Run T034–T038 until they pass.

**Checkpoint**: US1, US4 and US2 work.

---

## Phase 6: User Story 3 – Day timeline (Priority: P2)

**Goal**: a selected day shows a 24 h bar of shift (including a continuation from the previous night), sleep and free study windows with a list of times; Today shows a shift banner; Me links to the calendar.

**Independent Test**: with a Fri 22:00 → Sat 07:00 night shift and 8 h sleep, select Saturday: the list reads "00:00–07:00 Night shift (from Fri)", "07:30–15:30 Sleep, auto 8 h", "15:30–23:00 Free to study". On Friday afternoon Today shows "Night shift tonight · 22:00–07:00".

### Tests for User Story 3 (write first, see them fail)

- [X] T049 [P] [US3] Write unit tests for `dayTimeline(shifts, segments, timeZone, date)` in src/features/shifts/timeline.test.ts (research R6; data-model.md Profile.after_shift_buffer, Profile.waking_start, Profile.waking_end): continuation from the previous day, a shift ending the next day, sleep after a shift with the buffer, free windows only inside waking hours, a day with no shift, back-to-back shifts, a daylight-saving day.
- [X] T050 [P] [US3] Add tests for `getTodayBanner(student, now)` to src/features/shifts/repo.test.ts (research R7): a running shift; a night shift later today; none; free now with `until`; busy now with `nextAt`; `weekShifts` counts this local Mon–Sun.
- [X] T051 [P] [US3] Write Playwright tests in tests/e2e/us3-day.spec.ts (390×844 and 1280×800, axe): scenario 1 (the bar and list for Saturday), selecting another day needs no request, the Today banner in its three forms, the Me row "{n} shifts this week" linking to Shifts.

### Implementation for User Story 3

- [X] T052 [US3] Implement `dayTimeline` in src/features/shifts/timeline.ts (data-model.md Profile.after_shift_buffer, Profile.waking_start, Profile.waking_end; T049 passes) and `getTodayBanner` in src/features/shifts/repo.ts (T050 passes); extend src/app/api/shifts/today/route.ts with `shift`, `free` and `weekShifts` (contracts/route-handlers.md).
- [X] T053 [US3] `DayCard` in src/features/shifts/components/day-card.tsx on the Shifts screen: "Today · Fri 20 Nov" or the date, **Edit**, 003's `DayBar` and `DayBarScale`, and the list from `dayTimeline`; computed from the month query, so changing `?day=` makes no request.
- [X] T054 [US3] `ShiftBanner` in src/features/shifts/components/shift-banner.tsx above the streak cards in src/features/assignments/components/today-view.tsx (04-Today.png; research R7), and the **Shift calendar** row in src/features/profile/components/me-view.tsx (11-Profile.png; research R10).
- [X] T055 [US3] Add the day-list, `shiftBanner` and Me row strings to src/i18n/messages/en.json, my.json and ja.json.
- [X] T056 [US3] Run T049–T051 until they pass.

**Checkpoint**: all four stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T057 [P] Documentation (plan.md › Documentation updates): docs/data-model.md (new columns, the Off CHECK, one active rotation, presets on the profile, the rotation lifecycle) and docs/technical-spec.md (§3 `features/shifts` and `server/availability.ts`; the overnight helper line; the cron list; §11 the `--shift-*` tokens).
- [X] T058 [P] Review every new `my` and `ja` string for completeness and tone; list the strings that need a native speaker under a `_review` note in specs/005-shifts/quickstart.md, as 004 did.
- [X] T059 [P] Accessibility and layout pass at 390×844 and 1280×800: 44 px targets; the type picker and calendar by keyboard; chip and day names for screen readers; contrast of the `--shift-*` tokens in light and dark; fix findings in src/features/shifts/components/.
- [X] T060 Compare each changed screen with screenshots/07-Shifts.png, 08-ShiftEdit.png, 04-Today.png, 11-Profile.png and 16-AdminStudents.png at 390×844. Fix layout, hierarchy and copy, keeping only the differences listed in contracts/ui-routes.md.
- [X] T061 Performance (plan.md › Performance Goals): Lighthouse (mobile) ≥ 90 on `/s/shifts`; `/s/shifts` is one request per month and changing day makes none; saving a rotation is one transaction; `/a/students` adds exactly one statement for 10 students. Record the results in specs/005-shifts/quickstart.md §5, as 004 did.
- [X] T062 Run every gate from the package.json scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e` (production build on :3100), `pnpm build`.
- [X] T063 Walk through quickstart.md §4 scenarios 1–13 and record, for each one, the test that covers it or what wasn't checked, as in 004's walkthrough.
- [X] T064 Set **Status** to `Implemented` in specs/005-shifts/spec.md (constitution quality gate).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none. T001 before T007. T002 before T018 (the repo imports `server/availability.ts`).
- **Foundational (2)**: after Setup; blocks every story.
  - T007 before T008; T008 before all repo tests (generated client and the new columns).
  - T009, T010, T011 before any story's actions or queries.
- **US1 (3)**: after Foundational.
- **US4 (4)**: after Foundational. Independent of US1's screens (its tests seed shifts with fixtures); can run alongside US1.
- **US2 (5)**: after US1 (the Shifts screen, the editor and `saveShiftSettings`).
- **US3 (6)**: after US1 (the Shifts screen) and T043 (the today route it extends).
- **Polish (7)**: after the stories you're shipping.

### Within each story

Tests first and failing → pure modules → repo → actions and route handlers → components → pages → strings → story tests pass.

### Shared files (no [P] between these tasks)

- src/features/shifts/repo.ts: T018 → T052
- src/features/shifts/repo.test.ts: T015 → T050
- src/features/shifts/actions.ts: T019 → T042
- src/features/shifts/queries.ts: T011 → T019 → T043
- src/app/s/(tabs)/shifts/page.tsx: T021 → T045 → T046 → T053
- src/features/shifts/components/shift-editor.tsx: T022 → T045
- src/app/api/shifts/today/route.ts: T043 → T052
- src/features/assignments/components/today-view.tsx: T046 → T054
- src/lib/availability.test.ts: T006 → T036
- src/i18n/messages/*.json: T024, T032, T047, T055 (one at a time)

### Parallel opportunities

- Foundational tests T003–T006 together; then T009–T013 together while T007–T008 run in order.
- US1: T014–T016 together; T017 and T020 alongside T018.
- US4 as a whole alongside US1 (different files except the message files).
- US2: T034–T038 together; T039 and T040 together.
- US3: T049–T051 together.

---

## Parallel Example: Foundational tests

```bash
Task: "pgTAP supabase/tests/005_shift_policies.test.sql"
Task: "shiftInstants tests src/lib/time.test.ts"
Task: "Schema tests src/features/shifts/schemas.test.ts"
Task: "Property tests src/lib/availability.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Unit tests src/features/shifts/rotation.test.ts"
Task: "Unit tests src/features/shifts/week-check.test.ts"
Task: "Repo tests src/features/shifts/rotation-repo.test.ts"
Task: "Playwright tests/e2e/us2-rotation.spec.ts"
# then
Task: "rotation.ts" ; Task: "week-check.ts"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup and Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** with quickstart scenarios 2–3 and 11–12.
3. Phase 4 (US4). Validate with scenarios 1, 6–7. US1 + US4 are 005's P1 slice: students enter shifts and Admins see their availability.

### Incremental delivery

4. US2 (rotations, Sunday check): scenarios 8–10.
5. US3 (day timeline, Today banner, Me row): scenarios 4–5.
6. Polish, then merge `005-shifts` into `main`.

Implement in small batches (`/speckit-implement Phase 1`, `… T003–T006`, …), reviewing each diff and running tests before the next batch.

---

## Notes

- [P] = different files and no dependency on unfinished tasks.
- Every new Route Handler and Server Action starts with a guard; the cron route uses `CRON_SECRET` instead (plan.md › Complexity Tracking).
- Nothing is pushed or sent until 006.
- The shared move (T002) is a commit of its own with no behaviour change.
- Commit after each task group. Commit `schema.prisma` and the migration together (docs/data-model.md §7).
