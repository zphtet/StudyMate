# Implementation Plan: Assigning Courses and Deadlines

**Branch**: `003-assign-deadlines` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-assign-deadlines/spec.md`, clarified on 2026-11-21 (three answers added after `/speckit-analyze`: the "Move to …" rule, Published lessons only, one notice per item):
- notifications and default reminders are recorded now and delivered by 006;
- the course target date only pre-fills each student's Due field;
- shift/sleep clashes are also flagged while picking a time;
- a lesson deadline may be later than the course deadline;
- deadlines keep their moment when a student changes time zone;
- repeated changes to one deadline give one unread notice.

## Summary

Admins assign their Active courses to linked students from a sheet on the course screen, giving each student an optional course deadline in that student's own time. They set per-lesson deadlines and move them on a per-student Plan that shows the student's shifts, sleep and free time and flags clashes. Students see overdue, due-today and upcoming work on Today, the Courses list and the course screen.

It builds on `0_init`, which already has `course_assignments`, `lesson_deadlines`, `effective_due`, `busy_segments`, `notification_rules`, `notifications` and their RLS. The feature adds:
- a migration with one index, a tightened `deadlines_write` policy and a partial unique index for the default reminder set;
- three guards (`requireAdminOfAll`, `requireAssignmentOwner`, `requireLessonDeadlineTarget`);
- three Server Actions (`saveAssignments`, `setCourseDeadline`, `setLessonDeadline`) and seven Route Handlers, plus additive fields on two 002 endpoints;
- pure, unit-tested modules for status (`assignments/status.ts`), time-zone maths (`lib/time.ts`) and availability (`lib/availability.ts`);
- shared `DayBar`, `CalendarMonth` and `TimeBoth` components that 004–006 reuse.

Completion (004), shifts (005) and delivery (006) aren't built here; tests seed completions and shifts, and notices and rules are stored for 006.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies**:
- Already in the project: Next.js 16.4 (App Router), React 19.3, Prisma 7.10, TanStack Query 5.108, react-hook-form + Zod 4, next-intl 4, Tailwind CSS 4.3, shadcn/ui (`sheet`, `checkbox`, `dialog`, `alert-dialog`), `@dnd-kit/core` 6.3.1.
- **To add**: `date-fns` 4.4.0, `@date-fns/tz` 1.5.0 (research R14).

**Storage**: Supabase Postgres via Prisma: writes `course_assignments`, `lesson_deadlines`, `notification_rules`, `notifications`; reads `courses`, `lessons`, `lesson_progress`, `student_links`, `profiles`; calls `busy_segments()` with `$queryRaw`. No Storage use.

**Testing**: pgTAP (`pnpm test:db`) for policies, `effective_due` and the partial unique index. Vitest: unit tests for time helpers (4 zones, midnight, daylight saving), status, availability and schemas; guards and repos against the dev DB. Playwright US1–US4 at 390×844 and 1280×800 with axe.

**Target Platform**: mobile browsers first (iOS Safari 16.4+, Android Chrome), desktop; Vercel

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- assign a course to 2 students with deadlines in < 30 s (SC-001);
- the Plan week loads in one request (one `busy_segments` call + 2 Prisma queries) and renders in < 1 s on a mid-range phone with 50 cards;
- drag feedback within one frame; the optimistic move shows before the server answers;
- Lighthouse performance ≥ 90 on `/s/today` and `/a/plan` (mobile).

**Constraints**:
- no local Supabase or Docker;
- Prisma bypasses RLS, so guards come first;
- the client converts student-local inputs to instants and the server stores instants (constitution IV);
- 001 linking UI is unfinished (US2 tasks open), so tests link students with the 002 fixture;
- no push or inbox UI until 006.

**Scale/Scope**: a handful to a few dozen linked students per admin; up to ~100 lessons per course; up to ~50 deadlines per student-week. 5 screens changed (Assign sheet, Plan, Today, Courses, Course) plus the Deadline sheet; 3 languages.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 003 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. Every Route Handler and Server Action starts with a guard. RLS: `assign_read`/`assign_write` already match; `deadlines_write` is tightened to the same rule as `requireLessonDeadlineTarget` (research R12). Student reads are scoped to `me.id` | ✅ | ✅ |
| II. Spec first | Spec clarified (6 recorded answers). Screenshot differences are documented as "partial" in contracts/ui-routes.md (004/005/006 parts; name instead of "She") | ✅ | ✅ |
| III. Test-first | pgTAP for the migration and policies; guard tests with the same cases; unit tests for time, status and availability written before the code; one Playwright spec per user story | ✅ | ✅ |
| IV. Time | Instants in UTC; deadlines entered and seen in the **student's** zone with the admin's beside it when the zones differ (`TimeBoth` in sheets, `TimeBoth` compact on Plan cards and "Move to …"); days late and day rows by the student's calendar days; DST gaps and 23/25 h days handled in `lib/time.ts` (research R3) | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | 390 px first; 44 px targets; drag also works by keyboard and tap (FR-011); new colours are semantic tokens derived from theme variables, with a contrast test (research R13) | ✅ | ✅ |
| VI. Three languages | All UI strings and stored notice/rule texts in `en`/`my`/`ja` (notices in the student's locale) | ✅ | ✅ |
| VII. Stack | Constitution libraries only (`date-fns` + `@date-fns/tz`, `@dnd-kit`); Prisma for all tables; no supabase-js table queries; reads via Route Handlers + `queryOptions`, writes via Server Actions + Zod | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db, build; screenshots matched; spec status updated | ✅ | ✅ |

The constitution's open item "003: lesson status chips have no SQL function" is resolved by research R1: app code, reusing 002's `computeLocks()`.

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| Open the Assign sheet | – | ✓ own course | `requireCourseOwner` |
| Assign / unassign, set unlock order, default reminders, notify now | – | ✓ own Active course, own linked students | `requireCourseOwner` + `requireAdminOfAll` |
| Set, move, remove a course deadline | – | ✓ own course, linked student, active assignment | `requireAssignmentOwner` |
| Set, move, remove a lesson deadline | – | ✓ own course's lesson, linked student, active assignment | `requireLessonDeadlineTarget` |
| See the Plan, month counts, clash checks | – | ✓ own linked students | `requireAdminOf` |
| List linked students; a student's assigned courses | – | ✓ own | `requireRole('admin')` / `requireAdminOf` |
| See own Today, course deadlines, overdue counts | ✓ own | – | `requireRole('student')` + `studentId: me.id` |

## Project Structure

### Documentation (this feature)

```text
specs/003-assign-deadlines/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R15
├── data-model.md        # entities, derived values, lifecycles, migration, guards
├── quickstart.md        # prerequisites, commands, manual scenarios
├── contracts/
│   ├── route-handlers.md
│   ├── server-actions.md
│   └── ui-routes.md
├── checklists/requirements.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── a/(tabs)/plan/page.tsx                      # Plan (replaces placeholder)
│   ├── a/courses/[courseId]/page.tsx               # + students card and Assign sheet
│   ├── s/(tabs)/today/page.tsx                     # Today (replaces placeholder)
│   └── api/
│       ├── admin/courses/[courseId]/assign/route.ts
│       ├── admin/students/route.ts
│       ├── admin/students/[studentId]/courses/route.ts · clash/route.ts
│       ├── admin/plan/route.ts · admin/plan/month/route.ts
│       └── today/route.ts
├── features/assignments/
│   ├── actions.ts            # saveAssignments, setCourseDeadline, setLessonDeadline
│   ├── repo.ts (+ .test)     # assignments, lesson deadlines, default rules (Prisma)
│   ├── plan-repo.ts          # Plan week/month + busy_segments
│   ├── student-repo.ts       # Today + deadline facts for 002's student endpoints
│   ├── queries.ts            # queryOptions + keys
│   ├── schemas.ts (+ .test)
│   ├── status.ts (+ .test)   # effectiveDue, deadlineStatus, courseDeadlineStatus (R1, R2)
│   ├── notices.ts            # notice texts (student locale) → server/notifications/record.ts
│   ├── types.ts
│   └── components/           # AssignSheet, AssignStudentRow, DueField, ClashNotice, PlanView,
│                             # PlanWeek, PlanMonth, DeadlineCard, DeadlineSheet, TodayView, DueChip
├── features/courses/
│   ├── repo.ts               # applyUnlockInOrder extracted from updateCourse (R5)
│   ├── student-repo.ts       # + dueAt, overdueCount, per-lesson due/done (R11)
│   └── components/           # admin-course-view (students card), student course rows/cards (chips)
├── components/shared/
│   ├── day-bar.tsx · calendar-month.tsx · time-both.tsx
│   └── status-chip.tsx       # + danger, warning tones
├── lib/
│   ├── time.ts (+ .test)     # zonedToUtc, utcToZoned, calendarDaysBetween, moveToDay, … (R3)
│   └── availability.ts (+ .test)  # display segments, clash, suggestSlot (R7)
├── server/
│   ├── auth/guards.ts (+ .test)   # + requireAdminOfAll, requireAssignmentOwner, requireLessonDeadlineTarget
│   └── notifications/record.ts    # recordNotice upsert (R8)
├── app/globals.css                # + --destructive-soft, --avail-* tokens (R13)
└── i18n/messages/{en,my,ja}.json  # assign, deadlines, plan, today, reminders.default, notices, errors.*

prisma/
├── schema.prisma                  # + LessonDeadline @@index([studentId, dueAt])
└── migrations/<UTC timestamp>_assign_deadlines/migration.sql

supabase/tests/003_assign_policies.test.sql
tests/e2e/us1-assign · us2-deadlines · us3-student-due · us4-plan .spec.ts
tests/e2e/fixtures/courses.ts      # + setLessonDeadline, seedShift
```

**Structure Decision**: A single Next.js app, as in 001 and 002, with everything for this spec under `src/features/assignments` (the folder name in tech spec §3; 004's submission code should go under `features/progress` to avoid confusion). The student course list and course screen stay in `features/courses` and get deadline facts from `assignments/student-repo.ts`. Time-zone and availability logic goes in `src/lib` because 005 and 006 use it; `DayBar`, `CalendarMonth` and `TimeBoth` go in `src/components/shared` for the same reason.

**Documentation updates in this feature**:
- `docs/data-model.md`: `lesson_deadlines_student_due`; §4: replaced `deadlines_write`, `notification_rules_default_once`.
- `docs/technical-spec.md`: §3 `features/assignments`, `lib/availability.ts` display kinds (quiet hours excluded); §12 the `--avail-*` and `--destructive-soft` tokens.
- `specs/004-progress-assignments/spec.md` is **not** edited; flag for 004's clarify that the forecast should use the student's course deadline (003 clarification).

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Replacing the 0_init policy `deadlines_write` | It only checked `is_admin_of(student_id)`; the guard also requires the admin's own Published, non-deleted lesson and an active assignment (research R12) | A hand-written replacement in a reviewed migration, not a Prisma drop. Keeping the old policy would leave the two layers applying different rules (constitution I). pgTAP covers the old allowed cases and the new denied ones. |
| `busy_segments()` called from Prisma without a user token | The Plan needs the student's busy time on the server, after `requireAdminOf` | The function already allows `auth.uid() is null` for server connections (docs/technical-spec.md §6.3); computing busy time in TypeScript would duplicate the SQL definition 005/006 use. |
