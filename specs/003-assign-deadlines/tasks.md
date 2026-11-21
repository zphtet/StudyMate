---
description: "Tasks for 003 Assigning Courses and Deadlines"
---

# Tasks: Assigning Courses and Deadlines

**Input**: Design documents from `specs/003-assign-deadlines/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md (clarified 2026-11-21); 002's foundation (migration `20261121124949_courses_lessons`, guards, `computeLocks`, e2e fixtures). 001's linking UI (US2) and 002's delete/restore UI (US3) are **not** required: tests link students with `linkStudent()` and set `deleted_at` directly.

**Tests**: Required. Constitution III (test-first): pgTAP for database rules, Vitest for logic, guards and repos (written and failing before the code), Playwright per user story at 390×844 and 1280×800 with axe.

**Organization**: Grouped by user story in priority order: US1, US2, US3 (P1), then US4 (P2). US2 builds the Plan as a deadline editor (cards, drag, tap, "+ Deadline"); US4 adds availability bars, clash flags, "Move to …" and the Month view on the same screen. Completions (004) and shifts (005) are seeded by fixtures; notices and reminder rules are stored for 006.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths follow plan.md › Project Structure; field rules cite `data-model.md` (`Entity.field`) instead of repeating them

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies and branch

- [X] T001 Add runtime dependencies `date-fns@4.4.0 @date-fns/tz@1.5.0` to package.json with `pnpm add` (research.md R14; lockfile updated)
- [X] T002 Create and switch to the git branch `003-assign-deadlines` from `main` (no `before_specify` hook created it; spec.md names it)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migration and policy, guards, time and availability logic, status rules, notice recording, shared due-date input, tokens, fixtures. Every story depends on this phase.

**⚠️ CRITICAL**: no user story work starts until this phase is complete

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [X] T003 [P] pgTAP tests in supabase/tests/003_assign_policies.test.sql (cases in research.md R15), wrapped in `begin … rollback`:
  - `course_assignments`: the student reads their own rows; the course owner reads and writes rows for linked students (data-model.md CourseAssignment.courseId, CourseAssignment.studentId, CourseAssignment.assignedBy); another admin and an unlinked admin can't; `status` outside `active`/`removed` is refused (CourseAssignment.status);
  - `lesson_deadlines` (new `deadlines_write`): allowed for the owner's lesson with an active assignment for that student (LessonDeadline.lessonId, LessonDeadline.studentId, LessonDeadline.setBy); denied for another admin's lesson, a Draft lesson, a soft-deleted lesson, a `removed` assignment, an unlinked student, and when `set_by` ≠ caller; the student reads their own rows only;
  - `effective_due`: lesson deadline wins over the course deadline; course deadline when no lesson deadline; null after the assignment is `removed` (data-model.md CourseAssignment.dueAt, LessonDeadline.dueAt);
  - `notification_rules_default_once`: a second `preset: default` row with the same (admin, student, trigger) is refused; a non-preset rule is still allowed.
- [X] T004 [P] Guard tests in src/server/auth/guards.test.ts (extend the existing file and fixtures) with the same allowed and denied matrix as T003 (data-model.md › Guards): `requireAdminOfAll` (all linked → ok; one unlinked or pending → 403), `requireAssignmentOwner` (owner + linked + active → returns the assignment; removed, other admin's course or unlinked → 404/403), `requireLessonDeadlineTarget` (Draft lesson, deleted lesson, other admin's lesson, no active assignment → 404)
- [X] T005 [P] Unit tests in src/lib/time.test.ts for the research.md R3 helpers across Asia/Tokyo, Asia/Yangon, UTC and America/New_York:
  - `zonedToUtc`: date without time → 23:59 local; a time inside the spring-forward gap moves to the next valid time;
  - `utcToZoned` round-trips with `zonedToUtc`;
  - `calendarDaysBetween` around local midnight (23:59 vs 00:01 = 1 day) and across DST;
  - `moveToDay` keeps the local clock time across a DST change;
  - `localDayRange` gives 23 h and 25 h days on DST changes;
  - `roundUpToLocalHour` in Yangon (+6:30) lands on :00 local;
  - `cityOf('Asia/Yangon')` = "Yangon", `cityOf('America/New_York')` = "New York".
- [X] T006 [P] Unit tests in src/lib/availability.test.ts (research.md R7): kinds map `shift` → Shift, `sleep`/`night` → Sleep, `quiet` ignored; `mergeSegments` joins overlaps; `freeGaps` over a range; `clashAt` for an instant inside, on the edge of and outside a segment; `suggestSlot` picks the first gap that fits `max(minutes, 60)`, rounds up to the local hour (Yangon case), caps at the gap end, and returns null after 7 days
- [X] T007 [P] Unit tests in src/features/assignments/status.test.ts (research.md R1, R2): `effectiveDue` (lesson ?? course ?? null); `deadlineStatus` order done → overdue → due_soon → locked → upcoming → none (spec FR-005), the 24 h boundary, `daysLate` 0 for earlier today and N by the student's calendar days (Tokyo vs Yangon case); `courseDeadlineStatus` done only when every counting lesson is done
- [X] T008 [P] Unit tests in src/features/assignments/schemas.test.ts for the contracts/server-actions.md schemas: `dueAt` accepts an ISO instant with offset or null and rejects a date-only string; `saveAssignments` rows 1..200 with unique `studentId`s; uuids enforced
- [X] T009 [P] Tests against the dev database in src/server/notifications/record.test.ts (research.md R8): `recordNotice` inserts a row; a second call for the same (source_type, source_id, user, occurrence_key) updates title, body, url and `sent_at` and clears `read_at` (read → unread again); a null `source_id` is rejected by the function's type

### Implementation

- [X] T010 Migration per data-model.md › Migration: add `@@index([studentId, dueAt], map: "lesson_deadlines_student_due")` to `LessonDeadline` in prisma/schema.prisma; generate prisma/migrations/<UTC timestamp>_assign_deadlines/migration.sql with `prisma migrate diff` against the committed schema (docs/data-model.md §7); append by hand the replaced `deadlines_write` policy and `notification_rules_default_once`; run `pnpm prisma migrate deploy` and `pnpm prisma generate`; T003 passes
- [X] T011 [P] Time helpers in src/lib/time.ts (`zonedToUtc`, `utcToZoned`, `calendarDaysBetween`, `moveToDay`, `startOfLocalDay`, `localDayRange`, `roundUpToLocalHour`, `cityOf`) with `@date-fns/tz` `TZDate`; keep `todayIn`; T005 passes
- [X] T012 [P] Availability logic in src/lib/availability.ts (pure; `displaySegments`, `mergeSegments`, `freeGaps`, `clashAt`, `suggestSlot`) per research.md R7; T006 passes
- [X] T013 [P] Status rules in src/features/assignments/status.ts (`effectiveDue`, `deadlineStatus`, `courseDeadlineStatus`; takes the 002 lock state as input, no imports from repos); T007 passes
- [X] T014 [P] Zod schemas in src/features/assignments/schemas.ts (`dueAtSchema`, `saveAssignmentsSchema`, `setCourseDeadlineSchema`, `setLessonDeadlineSchema`) and shared types in src/features/assignments/types.ts (`DeadlineStatus`, `Due`, `Clash`, `Segment`, `StudentRef`, `PlanCard`, `TodayItem` from contracts/route-handlers.md); T008 passes
- [X] T015 Guards `requireAdminOfAll`, `requireAssignmentOwner`, `requireLessonDeadlineTarget` in src/server/auth/guards.ts, mirroring data-model.md › Guards (one query each; data-model.md CourseAssignment.status must be `active`); T004 passes
- [X] T016 `recordNotice({ userId, sourceId, occurrenceKey, title, body, url })` in src/server/notifications/record.ts (`import 'server-only'`; `source_type 'system'`; Prisma upsert on the compound unique key per data-model.md › Notifications recorded by 003); T009 passes
- [X] T017 [P] Theme tokens and chip tones (research.md R13): `--destructive-soft`, `--avail-shift`, `--avail-sleep`, `--avail-free` in src/app/globals.css (derived from existing variables, light and dark); `danger` and `warning` tones in src/components/shared/status-chip.tsx; extend src/app/theme-contrast.test.ts so chip text on the new backgrounds is ≥ 4.5:1 in all 10 themes
- [X] T018 [P] `TimeBoth` in src/components/shared/time-both.tsx: default "{date, time} ({city}) · {time} ({city})" and `compact` "{time} · {time} yours"; the second part only when the zones differ (research.md R4; uses `cityOf`; spec FR-008)
- [X] T019 Busy time on the server in src/features/assignments/plan-repo.ts (`import 'server-only'`): `getBusySegments(studentId, from, to)` via typed `$queryRaw` on `busy_segments` (docs/technical-spec.md §6.3) and `clashFor(studentId, at, minutes)` using src/lib/availability.ts; Route Handler GET src/app/api/admin/students/[studentId]/clash/route.ts (`requireAdminOf`, query parsed with Zod, shape per contracts/route-handlers.md); create src/features/assignments/queries.ts with the key factory (`assignKeys`, `planKeys`, `todayKeys`) and `clashQuery`
- [X] T020 `DueField` in src/features/assignments/components/due-field.tsx and `ClashNotice` in src/features/assignments/components/clash-notice.tsx (research.md R4): native date + optional time in the **student's** zone → `zonedToUtc`; "No deadline" clear button; `TimeBoth` line; inline warnings "Already overdue", optional "Later than the course deadline" (prop), and the shift/sleep clash from `clashQuery` (debounced 300 ms) with a "Move to {day time}" button (Admin's time added with `TimeBoth` `compact` when zones differ) that calls `onChange(suggestion)`; 44 px targets, labelled inputs
- [X] T021 [P] E2E fixtures in tests/e2e/fixtures/courses.ts: extend `assignCourse` with optional `dueAt` and `status` (data-model.md CourseAssignment.dueAt, CourseAssignment.status); add `setLessonDeadline(lessonId, studentId, dueAt, setBy)` (data-model.md LessonDeadline.dueAt, LessonDeadline.setBy), `seedShift(studentId, { startAt, endAt, type, sleepMinutes })`, `setTimezone(userId, tz)`, `softDeleteLesson(lessonId)`
- [X] T022 Add the `deadlines` namespace (chips, `DueField` labels and warnings, `TimeBoth`) and the new `errors.*` codes (`course_not_active`, `assignment_not_found`) to src/i18n/messages/{en,my,ja}.json

**Checkpoint**: database, guards and shared logic ready; all Phase 2 tests pass

---

## Phase 3: User Story 1 – Admin assigns a course to one or many students (Priority: P1) 🎯 MVP

**Goal**: admins assign an Active course to any linked students from a sheet on the course screen, with per-student deadlines in each student's own time, unlock order, default reminders and an optional notice.

**Independent Test**: assign one course to two linked students in different time zones with different deadlines; each sees the course with their own due date (quickstart.md §4 scenarios 1–2, 7).

### Tests for User Story 1 (write first, see them fail)

- [ ] T023 [P] [US1] Repo tests against the dev database in src/features/assignments/repo.test.ts (assign part):
  - first save creates one active row per ticked student with `assigned_by` = admin and the given `due_at` (data-model.md CourseAssignment.assignedBy, CourseAssignment.dueAt); a second save updates instead of duplicating;
  - unticking sets `removed` and keeps that student's `lesson_progress`, `submissions` and `lesson_deadlines`; ticking again restores `active` with the new `due_at` (data-model.md CourseAssignment.status; spec FR-007);
  - Draft, Archived or deleted course → `course_not_active`;
  - `addDefaultReminders` inserts the 4 rules of data-model.md › Default reminder set once per student, also when two saves run concurrently;
  - `notifyNow` records an `assigned` notice only for new or reassigned students; a changed `dueAt` for an already assigned student records one `deadline` notice; an unchanged one records none; texts are in the student's locale;
  - `unlockInOrder` change rewrites lesson rules exactly like 002's `updateCourse`.
- [ ] T024 [P] [US1] Playwright tests in tests/e2e/us1-assign.spec.ts (fixtures from T021):
  - scenario 1–3: Assign on an Active course lists both linked students with their cities; Due pre-fills from the course target date at 23:59 in each student's zone (spec clarification); assign → each student's Courses shows their own deadline;
  - scenario 2: admin in Yangon, student in Tokyo → `TimeBoth` shows both clocks; a time inside a seeded shift shows "{name} is on shift then" and "Move to …" fills the suggestion;
  - scenario 4: reopening the sheet shows the student ticked with their current deadline;
  - scenario 5: untick → confirm dialog names the student → student no longer sees the course;
  - scenarios 6–7: the switches persist rules and notices (checked through the fixture DB client);
  - scenario 8: the unlock switch shows the hint and changes the course setting;
  - Draft course shows no Assign button; no linked students → empty state;
  - axe has no serious violations.

### Implementation for User Story 1

- [ ] T025 [US1] Extract `applyUnlockInOrder(tx, courseId, on)` from `updateCourse` in src/features/courses/repo.ts and call it from both places (research.md R5); 002's existing tests still pass
- [ ] T026 [US1] Notice texts in src/features/assignments/notices.ts (`import 'server-only'`): `assignedNotice` and `deadlineNotice` render title and body with next-intl `getTranslations({ locale: student.locale, namespace: 'notices' })` and the due time formatted in the student's zone, then call `recordNotice` (data-model.md › Notifications recorded by 003)
- [ ] T027 [US1] Assignment repo in src/features/assignments/repo.ts (`import 'server-only'`; `ownerId: adminId` in every course `where`):
  - `getAssignSheet(adminId, courseId)` per contracts/route-handlers.md (actively linked students ordered by name, `assigned`, current data-model.md CourseAssignment.dueAt);
  - `saveAssignments(admin, input)` in one `prisma.$transaction` per research.md R5: upsert on (CourseAssignment.courseId, CourseAssignment.studentId) with CourseAssignment.assignedBy = admin and CourseAssignment.status `active`; previously active, now unticked rows → CourseAssignment.status `removed`; `applyUnlockInOrder` when changed; default rules with `createMany({ skipDuplicates: true })` (data-model.md › Default reminder set); notices from T026 after the transaction commits; returns counts; T023 passes
- [ ] T028 [US1] Server Action `saveAssignments` in src/features/assignments/actions.ts (`action()` + `saveAssignmentsSchema`; guards `requireCourseOwner` then `requireAdminOfAll`; errors and invalidation per contracts/server-actions.md)
- [ ] T029 [US1] Route Handler GET src/app/api/admin/courses/[courseId]/assign/route.ts (`requireCourseOwner`) and `assignSheetQuery(courseId)` in src/features/assignments/queries.ts
- [ ] T030 [P] [US1] `AssignStudentRow` in src/features/assignments/components/assign-student-row.tsx (checkbox, initial avatar, name, `cityOf` city, `DueField` when ticked) and `AssignSheet` in src/features/assignments/components/assign-sheet.tsx per contracts/ui-routes.md (bottom `Sheet`, side sheet ≥ 1024 px; "Students · N of M selected"; three switches with defaults and the unlock hint; "Assign to N students"; `AlertDialog` before unassigning; pre-fill from `targetDate`; `useMutation` → `saveAssignments`)
- [ ] T031 [US1] Students card with avatars, names and an **Assign** button (Active courses only) opening `AssignSheet`, in src/features/courses/components/admin-course-view.tsx, matching the students card of screenshots/18-AdminCourse.png (percentages come with 004)
- [ ] T032 [US1] Add the `assign`, `notices` and `reminders.default` strings to src/i18n/messages/{en,my,ja}.json; T024 passes

**Checkpoint**: US1 independently functional (assign, update, unassign, reassign, reminders and notices stored)

---

## Phase 4: User Story 2 – Admin sets and changes deadlines (Priority: P1)

**Goal**: admins set course and lesson deadlines per student and add, move or remove them on the Plan by drag, keyboard or tap.

**Independent Test**: set a course deadline and one lesson deadline for a student; the Plan shows the lesson card on its own date and one course card on the course date; drag the lesson card to another day and its time of day stays the same (quickstart.md §4 scenarios 2–3, 6).

### Tests for User Story 2 (write first, see them fail)

- [ ] T033 [P] [US2] Repo tests in src/features/assignments/repo.test.ts (deadline part; after T023 in the same file):
  - `setCourseDeadline` updates data-model.md CourseAssignment.dueAt and records a `deadline` notice only when the value changed; a `removed` assignment → `assignment_not_found`;
  - `setLessonDeadline` upserts data-model.md LessonDeadline.dueAt with LessonDeadline.setBy = admin, null deletes the row and the lesson falls back to the course deadline; a lesson deadline later than the course deadline is allowed (spec clarification); no active assignment → `assignment_not_found`; a Draft lesson → `lesson_not_found` (data-model.md LessonDeadline.lessonId);
  - a second change to the same lesson after the student read the first notice leaves one notice row, unread, with the latest text (spec FR-012);
  - app `effectiveDue` equals SQL `effective_due()` for the same seeded rows (research.md R2).
- [ ] T034 [P] [US2] Playwright tests in tests/e2e/us2-deadlines.spec.ts:
  - scenario 1–2: course deadline → course card on that day; lesson deadline → lesson card on its own day (Plan week view, student chip selected);
  - scenario 3: "+ Deadline" → course → lesson → date and time → card appears; "Whole course" replaces the course deadline; past time shows "Already overdue"; later than the course deadline shows the note; Draft lessons are not in the picker;
  - FR-008: with the Admin in Yangon and the student in Tokyo, the header says "Times in Tokyo time" and each card shows "{time} · {time} yours";
  - scenario 4: long-press drag to another day → same local time on the new day; keyboard: focus card, Space, ↓, Space → moved; done cards don't drag;
  - scenario 5: tap a card → change time → saved; Remove → lesson card disappears and the lesson falls back to the course date;
  - scenario 6: each change records one notice row (fixture DB client);
  - the hint names the student ("{name} gets a notification", FR-014); axe has no serious violations.

### Implementation for User Story 2

- [ ] T035 [US2] Deadline repo functions in src/features/assignments/repo.ts: `setCourseDeadline` (data-model.md CourseAssignment.dueAt), `setLessonDeadline` (upsert or delete; data-model.md LessonDeadline.lessonId, LessonDeadline.studentId, LessonDeadline.dueAt, LessonDeadline.setBy), both calling `deadlineNotice` when the effective value changed; `listLinkedStudents(adminId)`; `listStudentCoursesForAdmin(adminId, studentId)` (active courses with an active assignment, Published non-deleted lessons in 002 course order; data-model.md LessonDeadline.lessonId); T033 passes
- [ ] T036 [US2] `getPlanWeek(adminId, studentId, week)` in src/features/assignments/plan-repo.ts: 7 student-local days (`localDayRange`), lesson cards for lessons with their own deadline and one course card per course deadline in the week, counting only per spec FR-006, statuses from src/features/assignments/status.ts with 002 locks, `draggable` false when done, `adminTimezone` from the caller's profile (shape per contracts/route-handlers.md, `segments` and `clash` empty until US4)
- [ ] T037 [US2] Server Actions `setCourseDeadline` (`requireAssignmentOwner`) and `setLessonDeadline` (`requireLessonDeadlineTarget`) in src/features/assignments/actions.ts per contracts/server-actions.md
- [ ] T038 [US2] Route Handlers GET src/app/api/admin/students/route.ts (`requireRole('admin')`), GET src/app/api/admin/students/[studentId]/courses/route.ts (`requireAdminOf`) and GET src/app/api/admin/plan/route.ts (`requireAdminOf`; `week` must be a Monday in the student's zone, default current week); `linkedStudentsQuery`, `adminStudentCoursesQuery`, `planWeekQuery` in src/features/assignments/queries.ts
- [ ] T039 [P] [US2] `DeadlineCard` in src/features/assignments/components/deadline-card.tsx: drag handle, title, right-side label per status ("Done" green, "N days late"/"Overdue" red, time amber or grey; times via `TimeBoth` `compact`, so the Admin's time is added when zones differ, spec FR-008), `useDraggable` when `draggable`, tap opens the sheet; `aria-label` with title, day and status
- [ ] T040 [P] [US2] `DeadlineSheet` in src/features/assignments/components/deadline-sheet.tsx: course picker → "Whole course" or lesson picker (Published lessons only, from `adminStudentCoursesQuery`) → `DueField` with the "Later than the course deadline" check → Save / Remove; edit mode pre-selects the tapped card
- [ ] T041 [US2] `PlanView` and `PlanWeek` in src/features/assignments/components/plan-view.tsx and plan-week.tsx: student chips, "‹ 16 – 22 Nov ›" week navigation, "Times in {city} time" under it when the Admin's zone differs (spec FR-008), URL state `?student&week&view` (research.md R10), day rows as droppables, `DndContext` with `TouchSensor` (250 ms delay), `PointerSensor` (6 px) and `KeyboardSensor` (↑/↓ = previous/next day); drop → `moveToDay` → optimistic `planWeekQuery` update with rollback; "+ Deadline" button; hint text with the student's name; empty states
- [ ] T042 [US2] Plan page src/app/a/(tabs)/plan/page.tsx (replace the placeholder): prefetch `linkedStudentsQuery` and `planWeekQuery` with `HydrationBoundary`, default to the first linked student by name
- [ ] T043 [US2] Add the `plan` strings (header, week navigation, hint, sheet, empty states) to src/i18n/messages/{en,my,ja}.json; T034 passes

**Checkpoint**: US2 independently functional (course and lesson deadlines set, moved and removed; Plan as editor)

---

## Phase 5: User Story 3 – Student sees what is due and what is late (Priority: P1)

**Goal**: students see overdue, due-today and upcoming work on Today, the Courses list and the course screen, judged in their own time zone.

**Independent Test**: with three lessons (one past due, one due later today, one next week), check chips, Today sections and the Courses card count for a student in Tokyo and one in Yangon (quickstart.md §4 scenario 4, 8).

### Tests for User Story 3 (write first, see them fail)

- [X] T044 [P] [US3] Repo tests against the dev database in src/features/assignments/student-repo.test.ts:
  - Today groups by the student's local date: a deadline at 23:30 Yangon is "due today" for the Yangon student and the same instant is tomorrow for a Tokyo student;
  - overdue oldest first, due today earliest first;
  - only counting lessons (spec FR-006): Draft, soft-deleted, Archived-course and `removed`-assignment lessons are excluded; a soft-deleted lesson's deadline returns after restore (data-model.md › Lesson deadline lifecycle);
  - Courses: `dueAt` and `overdueCount` per active course; course screen: per-lesson `done` and `due`, Archived → `due` null.
- [X] T045 [P] [US3] Playwright tests in tests/e2e/us3-student-due.spec.ts (Tokyo and Yangon students, seeded deadlines and `markDone`):
  - scenario 1: Today shows "Overdue · N" then "Due today" with the right chips; 7 overdue items show 5 + "Show all (7)";
  - scenarios 2–3: chips and colours on the course screen ("2 days late", "Overdue", "Due today · 21:00 tonight", "Due tomorrow", "Due 24 Nov", "Done", "Locked");
  - scenario 4: header "Assigned by {admin} · finish by {date}", and no "finish by" without a course deadline;
  - scenario 5: Courses card "due 31 Dec · 1 overdue" and "no deadline";
  - nothing due → "Nothing due today"; axe has no serious violations.

### Implementation for User Story 3

- [X] T046 [US3] Student deadline repo in src/features/assignments/student-repo.ts (`import 'server-only'`; `studentId: me.id` in every `where`): `loadDeadlineFacts(studentId)` (active assignments' data-model.md CourseAssignment.dueAt, LessonDeadline.dueAt, done set, in two or three queries), `getToday(student, now)` per contracts/route-handlers.md using `effectiveDue`, `deadlineStatus` and 002 locks; T044 Today cases pass
- [X] T047 [US3] Extend `listStudentCourses` and `getStudentCourse` in src/features/courses/student-repo.ts and their types in src/features/courses/types.ts with `dueAt`, `overdueCount`, `course.dueAt` and per-lesson `done` and `due` from `loadDeadlineFacts` (research.md R11; additive, 002 tests still pass); T044 passes
- [X] T048 [US3] Route Handler GET src/app/api/today/route.ts (`requireRole('student')`) and `todayQuery` in src/features/assignments/queries.ts
- [X] T049 [P] [US3] `DueChip` in src/features/assignments/components/due-chip.tsx: default variant with label and tone per contracts/ui-routes.md › Course screen table (dates and times in the viewer's zone, "Due today"/"Due tomorrow" by local date); `variant="today"` with "N days late"/"Overdue" (red) and "by {time}" (amber) per contracts/ui-routes.md › Today
- [X] T050 [US3] Student course UI updates per contracts/ui-routes.md: chip, detail line and number-circle colour in src/features/courses/components/student-lesson-row.tsx; "· finish by {date}" in the header of src/features/courses/components/student-course-view.tsx; "due {date}" / "no deadline" and red "· N overdue" in src/features/courses/components/student-course-list.tsx, matching screenshots/09-Course.png and screenshots/05-Courses.png (partial)
- [X] T051 [US3] `TodayView` in src/features/assignments/components/today-view.tsx (date line via the existing `TodayLabel`, greeting, "Overdue · N" and "Due today" sections with `DueChip` `variant="today"`, 5 rows then "Show all (N)", rows link to `/s/lessons/[id]`, empty state) and the Today page src/app/s/(tabs)/today/page.tsx (replace the placeholder; prefetch `todayQuery`), matching screenshots/04-Today.png (partial)
- [X] T052 [US3] Add the `today` strings and the course-row detail lines to src/i18n/messages/{en,my,ja}.json; T045 passes

**Checkpoint**: US3 independently functional (students see due and late work everywhere)

---

## Phase 6: User Story 4 – Admin sees the plan per student (Priority: P2)

**Goal**: the Plan shows each day's shift, sleep and free time, flags deadlines that clash with them and offers a one-tap move; a Month view shows deadline counts.

**Independent Test**: seed shifts for a student and open the Plan week; each day shows the availability bar and its deadlines, and a deadline inside a shift is flagged with a move suggestion (quickstart.md §4 scenario 5).

### Tests for User Story 4 (write first, see them fail)

- [ ] T053 [P] [US4] Repo tests against the dev database in src/features/assignments/plan-repo.test.ts: segments are mapped (Shift/Sleep, quiet ignored) and clipped to each student-local day; a DST-change day has 23 or 25 h bounds (America/New_York student); `clash` only on not-done future cards; the suggestion leaves the lesson's minutes (min 60) of free time; month counts and late counts per local day
- [ ] T054 [P] [US4] Playwright tests in tests/e2e/us4-plan.spec.ts (seeded night shift Fri 22:00–Sat 07:00 with 8 h sleep):
  - scenario 1: bars per day with the legend; today highlighted with the now-marker;
  - scenario 2: a Fri 23:00 deadline shows "{name} is on shift then" + "Move to {day time}" at the first free time that fits the lesson, rounded up to the hour (spec FR-009); with quiet hours set, they don't create a clash; with the Admin in another zone the button adds "· {time} yours"; tapping moves it and records a notice;
  - scenario 3: Month shows counts (red when late); tapping a day opens that week;
  - scenario 4: a course deadline is one card;
  - scenario 5: a student with no shifts → bars from availability settings only, no clash;
  - axe has no serious violations.

### Implementation for User Story 4

- [ ] T055 [US4] Extend `getPlanWeek` in src/features/assignments/plan-repo.ts with per-day display `segments` (one `getBusySegments` call for the week + 7 days ahead), day bounds, and `clash` + `suggestion` per card via src/lib/availability.ts (minutes = lesson `est_minutes`, min 60; course cards 60); add `getPlanMonth(adminId, studentId, month)`; T053 passes
- [ ] T056 [US4] Route Handler GET src/app/api/admin/plan/month/route.ts (`requireAdminOf`) and `planMonthQuery` in src/features/assignments/queries.ts; the week route returns the new fields (contracts/route-handlers.md)
- [ ] T057 [P] [US4] `DayBar` in src/components/shared/day-bar.tsx: 00–24 of one local day scaled to its real length, `--avail-*` tokens, optional now-marker, `role="img"` with a text summary ("Shift 22:00–07:00, sleep …"); legend component Shift / Sleep / Free
- [ ] T058 [P] [US4] `CalendarMonth` in src/components/shared/calendar-month.tsx: month grid starting Monday, per-day badge slot, keyboard navigation, `onSelectDay`
- [ ] T059 [US4] Plan week additions in src/features/assignments/components/plan-week.tsx and deadline-card.tsx: `DayBar` per day row with the legend under the week header, today's row highlighted; clash cards get the amber border, "{name} is on shift then" / "{name} is asleep then" and a "Move to {day time}" button (label via `TimeBoth` `compact`, spec FR-008) that calls the US2 actions with the suggestion; no button when the suggestion is null
- [ ] T060 [US4] `PlanMonth` in src/features/assignments/components/plan-month.tsx (counts, red when late; tap → week view of that week) and the Week/Month toggle in src/features/assignments/components/plan-view.tsx (`view` in the URL)
- [ ] T061 [US4] Add the plan legend, clash and month strings to src/i18n/messages/{en,my,ja}.json; T054 passes

**Checkpoint**: all user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T062 [P] Documentation:
  - docs/data-model.md: `lesson_deadlines_student_due` in the `lesson_deadlines` row; §4: the replaced `deadlines_write` and `notification_rules_default_once`.
  - docs/technical-spec.md: §3 `features/assignments` and `lib/availability.ts` (display kinds, quiet hours excluded); §12 the `--avail-*` and `--destructive-soft` tokens and `TimeBoth`/`DayBar`/`CalendarMonth`.
- [ ] T063 [P] Review every new `my` and `ja` string for completeness and tone; list strings needing a native speaker under a `_review` note in specs/003-assign-deadlines/quickstart.md
- [ ] T064 [P] Accessibility and layout pass at 390×844 and 1280×800: 44 px targets, labels on date/time inputs, focus order in the Assign and Deadline sheets, keyboard drag on the Plan, every drag action also possible by tap (spec FR-011). Fix findings in src/features/assignments/components/ and src/components/shared/
- [ ] T065 Compare each changed screen with screenshots/04-Today.png, 05-Courses.png, 09-Course.png, 18-AdminCourse.png, 22-AdminPlan.png and 23-AdminAssign.png at 390×844, and fix layout, hierarchy and copy, keeping only the "partial" differences in contracts/ui-routes.md
- [ ] T066 Performance: the Plan week is one request with one `busy_segments` call (check server logs); Lighthouse performance on `/s/today` and `/a/plan` (mobile) ≥ 90; `@dnd-kit` loads only on admin routes; record results in specs/003-assign-deadlines/quickstart.md §5
- [ ] T067 Run every gate from package.json scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`
- [ ] T068 Walk through specs/003-assign-deadlines/quickstart.md §4 scenarios 1–10 and note any failures
- [ ] T069 Set **Status** to `Implemented` in specs/003-assign-deadlines/spec.md (constitution quality gate)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none. T001 before T011; T002 before any commit.
- **Foundational (2)**: after Setup; blocks every story. T010 before T015 and T016 (generated client); T011 before T012, T018 and T020; T012 and T015 before T019; T018 and T019 before T020.
- **US1 (3)**: after Foundational.
- **US2 (4)**: after Foundational (tests seed assignments with `assignCourse`). T035 and T037 extend files from T027 and T028, so run after US1's repo and action tasks, or create the files if US1 isn't done.
- **US3 (5)**: after Foundational only (tests seed assignments and deadlines). Can run in parallel with US1 and US2.
- **US4 (6)**: after US2 (it extends the Plan screen, `getPlanWeek` and `DeadlineCard`).
- **Polish (7)**: after the stories you're shipping.

### Within each story

Tests first and failing → repo → actions and route handlers → components → pages → strings → story tests pass.

### Shared files (no [P] between these tasks)

- src/features/assignments/repo.ts: T027 → T035
- src/features/assignments/repo.test.ts: T023 → T033
- src/features/assignments/actions.ts: T028 → T037
- src/features/assignments/queries.ts: T019 → T029 → T038 → T048 → T056
- src/features/assignments/plan-repo.ts: T019 → T036 → T055
- src/features/assignments/components/plan-week.tsx, deadline-card.tsx, plan-view.tsx: T039/T041 → T059 → T060
- src/server/auth/guards.ts: T015 only
- src/i18n/messages/*.json: T022, T032, T043, T052, T061 (one at a time)

### Parallel opportunities

- Setup: T002 alongside T001.
- Foundational tests: T003–T009 together; then T011–T014, T017, T018 and T021 together.
- US1: T023 with T024; T030 alongside T026–T029.
- US2: T033 with T034; T039 and T040 alongside T035–T038.
- US3: T044 with T045; T049 alongside T046–T048; the whole phase alongside US1/US2.
- US4: T053 with T054; T057 and T058 alongside T055–T056.

---

## Parallel Example: Foundational tests

```bash
# Tests together (all different files):
Task: "pgTAP supabase/tests/003_assign_policies.test.sql"
Task: "Guard tests src/server/auth/guards.test.ts"
Task: "Unit tests src/lib/time.test.ts"
Task: "Unit tests src/lib/availability.test.ts"
Task: "Unit tests src/features/assignments/status.test.ts"
Task: "Unit tests src/features/assignments/schemas.test.ts"
Task: "DB tests src/server/notifications/record.test.ts"

# Then independent implementation:
Task: "Time helpers src/lib/time.ts"
Task: "Availability src/lib/availability.ts"
Task: "Status rules src/features/assignments/status.ts"
Task: "Schemas and types src/features/assignments/schemas.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Repo tests src/features/assignments/student-repo.test.ts"
Task: "Playwright tests/e2e/us3-student-due.spec.ts"
# then
Task: "DueChip src/features/assignments/components/due-chip.tsx"   # alongside T046–T048
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup.
2. Phase 2 Foundational.
3. Phase 3 (US1). **Stop and validate** with quickstart scenarios 1–2 and 7.
4. Phases 4 and 5 (US2, US3): the feature's MVP. Admins set and move deadlines; students see what is due and late (quickstart scenarios 2–4, 6, 8–10).

### Incremental delivery

5. US4 (availability bars, clashes, Month): quickstart scenario 5.
6. Polish, then merge `003-assign-deadlines` into `main`.

Implement in small batches (`/speckit-implement Phase 1`, `… T003–T009`, …), reviewing each diff and running tests before the next batch.

---

## Notes

- [P] = different files and no dependency on unfinished tasks.
- Every new Route Handler and Server Action starts with a guard; there are no exceptions in 003.
- Notices and default rules are stored only; nothing is pushed until 006 (spec FR-012).
- Commit after each task group; commit `schema.prisma` and the migration together (docs/data-model.md §7).
