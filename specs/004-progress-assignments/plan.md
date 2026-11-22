# Implementation Plan: Completion, Assignments and Progress

**Branch**: `004-progress-assignments` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-progress-assignments/spec.md`. It was clarified on 2026-11-22 with five answers:
- streak days split at the student's local midnight;
- notices are recorded for 006, and open screens update through Realtime;
- the focus timer is capped at the chosen length;
- a submission is read-only once Submitted, and "Needs redo" reopens it for editing without touching completion;
- Notes is a shared thread per student and lesson.

Planning added two spec edits:
- US3 scenario 2 uses the student's course deadline (003's decision);
- the Edge Cases say a done lesson stays open after an earlier one is undone.

`/speckit-analyze` (2026-11-22) added more spec edits:
- an Admin may change a review (FR-004);
- sessions under 1 minute don't count (FR-007, US4 scenario 3);
- a Role access section;
- "lessons done this week" on the admin card;
- `planned_minutes` and the `minutes_spent` meaning in Key Entities;
- offline completion marked as 008.

It also aligned the Notes comment rule with `can_read_lesson` (research R11).

## Summary

Students mark lessons complete (and undo), write and submit assignments with Markdown and up to 5 photos, talk to their Admin in a per-lesson Notes thread, and run 15- or 25-minute focus timers. From those facts the app shows:
- a streak and weekly goal on Today;
- a Progress screen with a heat calendar, period totals and a finish forecast per course;
- progress bars on Courses;
- a card per student on the Admin's Students tab.

Admins review submissions (Reviewed / Needs redo with a comment), post in Notes, and mark lessons done or reopen them, with each change audited.

It builds on `0_init`, which already has `lesson_progress`, `submissions`, `comments`, `study_sessions`, `audit_log`, the `course_progress` view and the `submissions` bucket with RLS. The feature adds:
- a migration: `study_sessions.planned_minutes` with a cap check and a one-running index; three indexes; policies tightened so they match the guards (research R11); bucket limits; three tables in the Realtime publication;
- guards: one new (`requireSubmissionReviewer`) and one renamed (`requireLessonDeadlineTarget` → `requireAdminLessonTarget`);
- 10 Server Actions and 9 Route Handlers (plus additive fields on 2 course endpoints);
- pure, unit-tested modules: `streak`, `forecast`, `focus`, `submission-status`, `completion`, `heat`;
- a `useRealtimeInvalidate` hook and shared `WeekBars` and `ProgressBar` components. `MdTextarea` and the image resize code move to shared places.

Offline queueing (008), push and the inbox (006), and shifts (005) aren't built here.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies**: no additions (research R16). The feature uses what's already installed:
- Next.js 16.4, React 19.3, Prisma 7.10, TanStack Query 5.108, Zod 4, next-intl 4, Tailwind CSS 4.3;
- shadcn/ui (`sheet`, `dropdown-menu`, plus generated `tabs` on the installed `radix-ui` 1.8);
- `@uiw/react-md-editor` 4.2.4;
- `@supabase/supabase-js` 2.119 (Storage, Realtime);
- `date-fns` 4.4 and `@date-fns/tz` 1.5.

**Storage**:
- Supabase Postgres via Prisma:
  - writes `lesson_progress`, `submissions`, `comments`, `study_sessions`, `audit_log`, `notifications` and `profiles.weekly_goal_days`;
  - reads `course_progress`, `course_assignments`, `lessons`, `student_links`, `profiles`;
  - daily totals with one grouped `$queryRaw` (research R2).
- Supabase Storage: the private `submissions` bucket. The browser uploads with supabase-js; reads go through signed URLs made with the caller's client.
- Supabase Realtime: `postgres_changes` on 3 tables, under RLS.

**Testing**:
- pgTAP (`pnpm test:db`) for the tightened policies, the transitions, the session checks, Storage and the view.
- Vitest:
  - unit tests written first for streak (4 zones, daylight saving), forecast, focus, submission status, completion and heat;
  - guards and repos against the dev DB.
- Playwright: US1–US4 at 390×844 and 1280×800 with axe. The SC-002 live check uses two browser contexts.

**Target Platform**: mobile browsers first (iOS Safari 16.4+, Android Chrome), then desktop; hosted on Vercel.

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- Mark complete updates the lesson screen optimistically (< 100 ms), and Today, Courses and Progress are fresh within 1 s (SC-001).
- A new submission appears on an open Admin Students screen within 5 s (SC-002).
- `/s/progress` takes one request: two grouped SQL queries plus `course_progress`, and renders in under 1 s on a mid-range phone.
- `/a/students` uses a fixed number of queries for all students (no N+1).
- Lighthouse performance ≥ 90 on `/s/progress` and `/s/lessons/[id]` (mobile). `MdTextarea` loads only when the Assignment tab opens.

**Constraints**:
- no local Supabase or Docker;
- Prisma bypasses RLS, so guards come first;
- the timer uses server time;
- daily grouping is done by Postgres in the student's IANA zone;
- no Zustand or Dexie (research R3, R15);
- no push or inbox UI until 006;
- the 001 linking UI is unfinished, so tests link with fixtures.

**Scale/Scope**:
- a handful to a few dozen students per admin;
- ≤ ~100 lessons per course;
- a few hundred active days of history per student;
- 5 images per submission.

Screens: 9 routes in all. 2 are new admin screens; 7 existing screens change (Lesson, Progress, Today, Courses, Course, Me, Admin Students). Everything is in 3 languages.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 004 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. Every Route Handler and Server Action starts with a guard. The 0_init policies that were looser than the guards (`progress_student`, `subs_student`, `subs_admin_review`, `comments_write`, the submission Storage policies) are replaced so both layers apply the same rules (research R11). The student's id always comes from the session. | ✅ | ✅ |
| II. Spec first | Spec clarified with 5 recorded answers. Two behaviour edits from planning are made in the spec first (Input above). Screenshot differences are listed in contracts/ui-routes.md. | ✅ | ✅ |
| III. Test-first | Unit tests for every pure module before the code; pgTAP for each replaced policy (old allowed cases and new denied ones); guard tests with the same matrix; one Playwright spec per user story. | ✅ | ✅ |
| IV. Time | Instants in UTC. Study days, weeks and months are the student's local calendar (Postgres `at time zone`, `todayIn`), checked on daylight-saving weeks. The timer is stamped and capped on the server. Admin screens show the student's time first, with `TimeBoth` beside it. | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | 390 px first; 44 px targets; real `tablist`, `progressbar` and labelled heat cells; the timer announces each minute, not each second; heat colours `--heat-1..4` are mixed from theme variables and covered by the contrast test. | ✅ | ✅ |
| VI. Three languages | All UI strings and notice texts in `en`/`my`/`ja`; notices in the recipient's locale. | ✅ | ✅ |
| VII. Stack | Constitution libraries only. Prisma for every table. supabase-js only for Storage uploads and signed URLs and for Realtime. Reads via Route Handlers + `queryOptions`; writes via Server Actions + Zod. | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db and build pass; screenshots matched; spec status updated. | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| Complete or undo a lesson | ✓ own, readable, unlocked, Active course | – | `requireRole('student')` + `requireLessonReader` + `placeStudentLesson` |
| Mark done or reopen for a student (audited) | – | ✓ own course, linked student, active assignment, Active course | `requireAdminLessonTarget` |
| Save a draft, submit | ✓ own, lesson has a prompt, status Draft / Needs redo | – | as for completing |
| Read a submission and its images | ✓ own (any status) | ✓ linked student, not Draft | owner check / `requireSubmissionReviewer` |
| Review (Reviewed / Needs redo + comment) | – | ✓ linked student, not Draft | `requireSubmissionReviewer` |
| Read and post in Notes | ✓ own thread on a readable lesson | ✓ linked student's thread on own course's lesson | `requireLessonReader` / `requireAdminLessonTarget` |
| Start or stop focus | ✓ own | – | `requireRole('student')` + lesson guards |
| Progress, Today summary, set weekly goal | ✓ own | – | `requireRole('student')` |
| Students cards, student detail, lesson review screen | – | ✓ linked students | `requireRole('admin')` / `requireAdminOf` / `requireAdminLessonTarget` |

## Project Structure

### Documentation (this feature)

```text
specs/004-progress-assignments/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R17
├── data-model.md        # entities, derived values, lifecycles, migration, guards
├── quickstart.md        # prerequisites, commands, manual scenarios
├── contracts/
│   ├── route-handlers.md
│   ├── server-actions.md
│   └── ui-routes.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── s/lessons/[lessonId]/page.tsx                 # + work tabs, bottom bar (prefetch lesson + work)
│   ├── s/(tabs)/progress/page.tsx                    # replaces the placeholder
│   ├── s/(tabs)/today/page.tsx · courses/page.tsx    # + progress cards
│   ├── s/courses/[courseId]/page.tsx                 # + progress card
│   ├── s/(tabs)/me/page.tsx                          # + weekly goal row
│   ├── a/(tabs)/students/page.tsx                    # + student cards
│   ├── a/students/[studentId]/page.tsx               # new
│   ├── a/students/[studentId]/lessons/[lessonId]/page.tsx  # new
│   └── api/
│       ├── lessons/[lessonId]/work/route.ts · notes/route.ts
│       ├── focus/route.ts
│       ├── progress/route.ts · progress/summary/route.ts
│       ├── submissions/[submissionId]/files/[name]/route.ts
│       └── admin/students/progress/route.ts · [studentId]/route.ts · [studentId]/lessons/[lessonId]/route.ts
├── features/progress/
│   ├── actions.ts            # completeLesson, undoCompletion, setLessonDone, saveDraft, submitAssignment,
│   │                         # reviewSubmission, postNote, startFocus, stopFocus
│   ├── repo.ts (+ .test)     # completion, submissions, comments, sessions, dailyActivity
│   ├── admin-repo.ts         # student cards, student detail, lesson review
│   ├── queries.ts · schemas.ts (+ .test) · types.ts
│   ├── streak.ts · forecast.ts · focus.ts · submission-status.ts · completion.ts · heat.ts (each + .test)
│   ├── notices.ts            # submitted / reviewed texts → server/notifications/record.ts
│   ├── upload.ts             # submission image upload (uses lib/image.ts)
│   └── components/           # see contracts/ui-routes.md
├── features/courses/
│   ├── lock.ts (+ .test)     # + done lessons always open (R1)
│   ├── student-repo.ts       # + percent, doneCount, course.progress (course_progress)
│   ├── purge.ts              # + delete comments of purged lessons and submissions (R8)
│   └── upload.ts             # resize helpers moved to lib/image.ts
├── features/assignments/
│   ├── student-repo.ts       # + countOverdue(studentIds, now) for admin cards
│   └── notices.ts            # textsFor moved to server/notifications/texts.ts
├── features/profile/         # + setWeeklyGoal, WeeklyGoalSheet row on Me
├── components/shared/
│   ├── week-bars.tsx · progress-bar.tsx            # new
│   ├── md-textarea.tsx                              # moved from features/courses/components
│   └── calendar-month.tsx                           # + day render slot if needed
├── components/ui/tabs.tsx                           # generated by shadcn
├── lib/
│   ├── image.ts              # resize helpers (moved from features/courses/upload.ts)
│   ├── content.ts            # MAX_CONTENT_BYTES, utf8Bytes (moved from features/courses/schemas.ts)
│   └── realtime.ts           # useRealtimeInvalidate
├── server/
│   ├── auth/guards.ts (+ .test)   # + requireSubmissionReviewer; rename → requireAdminLessonTarget
│   └── notifications/texts.ts     # textsFor(recipient) (moved from assignments)
├── app/globals.css                # + --heat-1..4
└── i18n/messages/{en,my,ja}.json  # lessonWork, submission, notes, progress, todayProgress, weeklyGoal,
                                   # adminStudents, notices.*, errors.*, validation.*

prisma/
├── schema.prisma                  # + StudySession.plannedMinutes, 3 @@index
└── migrations/<UTC timestamp>_progress/migration.sql

supabase/tests/004_progress_policies.test.sql
tests/e2e/us1-complete · us2-submit · us3-progress · us4-focus .spec.ts
tests/e2e/fixtures/courses.ts      # + seedSession, seedComment; markDone gains completedAt
```

**Structure Decision**: One Next.js app, as in 001–003. Everything about the student's work goes in `src/features/progress`, as 003's plan suggested to avoid confusion with `features/assignments`, which owns deadlines.
- Course data (percent, lesson order, locks) stays in `features/courses`. Overdue rules stay in `features/assignments`, exposed through one new repo function.
- Pages compose queries from more than one feature instead of features reading each other's internals.
- Code that a second feature now uses moves to shared places first: `MdTextarea`, the image resize helpers, `textsFor`. These moves are separate commits with no behaviour change.

**Documentation updates in this feature**:
- `docs/data-model.md`:
  - `minutes_spent` meaning, `planned_minutes`, new indexes and checks;
  - §4: replaced policies and bucket limits;
  - §5: the renamed guard;
  - §6: the Realtime tables.
- `docs/technical-spec.md`:
  - §3: `features/progress`, `lib/realtime.ts`, `lib/image.ts`;
  - §7: `useRealtimeInvalidate` as built;
  - the streak line no longer says "open question";
  - §12: the `--heat-*` tokens.
- `specs/004-progress-assignments/spec.md`: the two edits named in Input; Status → Implemented when done.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Replacing 5 policies from 0_init and 2 Storage policies | They allowed more than the guards: a student could set their own submission to Reviewed, write `completed_by` as anyone, or post comments on any target; an admin could read Draft files (research R11) | They are hand-written replacements in a reviewed migration, not Prisma drops. Keeping them would leave the two layers applying different rules (constitution I). pgTAP covers the old allowed cases and the new denied ones. |
| A NOT NULL column without a default on `study_sessions` | The cap (FR-007) is a database check that needs the planned length on every row | A default would invent a planned length for rows that never had one. The table is empty on dev; the migration checks this first (quickstart §2). |
| Renaming 003's `requireLessonDeadlineTarget` | Four 004 actions need the same check; the old name would mislead | A second guard with the same body would duplicate an access rule. The rename is mechanical (12 references, 4 files) and is its own commit. |
