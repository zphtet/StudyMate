---
description: "Tasks for 004 Completion, Assignments and Progress"
---

# Tasks: Completion, Assignments and Progress

**Input**: Design documents from `specs/004-progress-assignments/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**:
- plan.md and spec.md (clarified 2026-11-22).
- 003 as merged: migration `20261121165125_assign_deadlines`, `recordNotice`, `lib/time.ts`, `CalendarMonth`, `TimeBoth`, the e2e fixtures `markDone` and `seedSubmission`.
- 001's linking UI is **not** required: tests link students with `linkStudent()`.
- Offline (008), push and inbox (006) and shifts (005) are out of scope.

**Tests**: Required by constitution III (test-first):
- pgTAP for database rules;
- Vitest for logic, guards and repos, written and failing before the code;
- Playwright per user story at 390×844 and 1280×800 with axe, run against a production build on :3100 (leave the dev server on :3000 alone).

**Organization**: Grouped by user story in priority order: US1, US2, US3 (P1), then US4 (P2).
- **US1** builds the lesson screen's tab shell, its bottom bar and the two new admin screens (student detail, lesson review) with Mark done / Reopen.
- **US2** fills the Assignment and Notes tabs and adds the review.
- **US3** adds the progress numbers everywhere.
- **US4** adds the focus timer to the bottom bar.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths follow plan.md › Project Structure. Field rules cite `data-model.md` (`Entity.field`) instead of repeating them.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: generated UI primitive and a database precondition. The branch `004-progress-assignments` already exists.

- [X] T001 Generate the shadcn Tabs primitive into src/components/ui/tabs.tsx with the project's own CLI, `pnpm shadcn add tabs` (research.md R16). Check that package.json has no new dependency (`radix-ui` 1.8 is already installed) and don't edit the generated file.
- [X] T002 Check the dev database precondition for the migration: `select count(*) from study_sessions` on `DIRECT_URL` must be 0 (data-model.md › Migration, StudySession.planned_minutes; quickstart.md §2). If it isn't 0, stop and report. (2026-11-22: 0 rows.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migration and policies, guards, action schemas, query keys, shared progress bar, fixtures. Every story depends on this phase.

**⚠️ CRITICAL**: no user story work starts until this phase is complete

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [ ] T003 [P] Write pgTAP tests in supabase/tests/004_progress_policies.test.sql (research.md R11, R17), wrapped in `begin … rollback`. Switch users with `set local role authenticated` and `request.jwt.claims`, as in 003_assign_policies.test.sql. Cases:
  - **`lesson_progress`**: the student inserts and updates their own row for a readable lesson with `completed_by` = self or null; it is denied with another `completed_by`, or for an unreadable lesson (data-model.md LessonProgress.completed_by, LessonProgress.status). The linked Admin inserts and updates rows for a lesson in their own course with `completed_by` = self; denied for another admin, an unlinked admin, or another admin's course. Nobody can DELETE.
  - **`submissions`**: the student inserts as `draft` or `submitted` but not `reviewed`. They update from `draft`/`needs_redo` to `draft`/`submitted` and can't update from `submitted` or `reviewed`, or set `reviewed`/`needs_redo` (data-model.md Submission.status, Submission.reviewed_at). The Admin reads non-Draft only, updates a non-Draft to `reviewed`/`needs_redo`, and can't update a Draft or set `submitted`. Another admin is denied.
  - **`comments`**: a lesson target in a course with an active assignment for `student_id` is allowed for that student and their Admin. A student posts on a lesson of their own personal course (`can_read_lesson`, research.md R11); their linked Admin can't post there. Denied: a lesson of an unassigned course; a submission target written by a student; a submission target whose submission belongs to another student or is a Draft; `author_id` ≠ caller (data-model.md Comment.author_id, Comment.student_id, Comment.target_type, Comment.target_id, Comment.body). There is no UPDATE or DELETE.
  - **`study_sessions`**: `planned_minutes` 20 is refused; `ended_at` past `started_at + planned_minutes` is refused; a second open session for one student is refused by `study_sessions_one_running` (data-model.md StudySession.planned_minutes, StudySession.ended_at).
  - **`storage.objects`, bucket `submissions`**: the student reads and writes `<self>/<lesson>/x.webp` but not another student's folder. The linked Admin reads a file only when a non-Draft submission exists for (folder 1, folder 2). The bucket has `file_size_limit` 2097152 and the two MIME types (data-model.md Submission.attachments).
  - **`course_progress`**: a course whose lessons are all Draft gives `percent` null.
  - **Realtime**: `pg_publication_tables` lists `submissions`, `comments`, `lesson_progress` for `supabase_realtime`.
- [ ] T004 [P] Extend guard tests in src/server/auth/guards.test.ts (data-model.md › Guards):
  - rename every `requireLessonDeadlineTarget` case to `requireAdminLessonTarget` with the same expectations;
  - add `requireSubmissionReviewer`:
    - linked Admin with a `submitted` submission → returns `{ me, submission }`;
    - a Draft → 404 `submission_not_found`;
    - another admin, or an unlinked admin → 404/403;
    - the lesson in another admin's course → 404;
    - a student caller → 403.
- [ ] T005 [P] Write unit tests in src/features/progress/schemas.test.ts for every input schema in contracts/server-actions.md › Field schemas and each action:
  - attachments: 0–5 accepted, 6 → `too_many_images`; `size` above 2 097 152 → `file_too_large` (data-model.md Submission.attachments);
  - `bodyMd` over `MAX_CONTENT_BYTES` → `content_too_long` (data-model.md Submission.body_md);
  - comment body: blank → `commentRequired`, 2001 characters → `commentTooLong` (data-model.md Comment.body);
  - `minutes` only 15 or 25 (data-model.md StudySession.planned_minutes);
  - `reviewSubmission.status` only `reviewed`/`needs_redo`;
  - weekly goal days 1–7;
  - uuids enforced.
- [ ] T006 [P] Write a component test in src/components/shared/progress-bar.test.tsx: `role="progressbar"` with `aria-valuenow`; `percent` null renders "—" with no fill; the accent prop maps to a token class, not a hex colour.

### Implementation

- [ ] T007 Edit prisma/schema.prisma:
  - `StudySession.plannedMinutes Int @map("planned_minutes") @db.SmallInt`;
  - `@@index([studentId, completedAt], map: "lesson_progress_student_completed")` on LessonProgress;
  - `@@index([studentId, targetType, targetId, createdAt], map: "comments_thread")` on Comment;
  - `@@index([studentId, startedAt], map: "study_sessions_student_started")` on StudySession.

  Generate prisma/migrations/<UTC timestamp>_progress/migration.sql with `prisma migrate diff` against the committed schema (docs/data-model.md §7). Then add by hand, in this order, data-model.md › Migration items 1–5:
  1. the checks `study_sessions_planned` and `study_sessions_capped` (data-model.md StudySession.planned_minutes, StudySession.ended_at);
  2. the partial unique index `study_sessions_one_running`;
  3. the replaced policies from research.md R11, each `drop policy` paired with its hand-written replacement;
  4. the bucket limits (data-model.md Submission.attachments);
  5. the Realtime publication.

  Never drop SQL-only objects.
- [ ] T008 Apply and verify: `pnpm prisma migrate deploy`, `pnpm prisma generate`, `pnpm test:db`. T003 passes and the 001–003 pgTAP files still pass.
- [ ] T009 Rename `requireLessonDeadlineTarget` to `requireAdminLessonTarget` in src/server/auth/guards.ts and its callers src/features/assignments/actions.ts and src/features/assignments/repo.ts (research.md R11). No behaviour change; update the doc comment to name 003 deadlines and the 004 admin lesson actions. Commit on its own; the 003 tests and T004's renamed cases pass.
- [ ] T010 Add `requireSubmissionReviewer(submissionId)` to src/server/auth/guards.ts (data-model.md › Guards; mirrors `subs_admin_review`). One Prisma query: a submission whose status isn't `draft`, whose student is actively linked to the caller, and whose lesson is in a course the caller owns. Throw `AuthError(404, …, 'submission_not_found')` otherwise. T004 passes.
- [ ] T011 [P] Create src/features/progress/schemas.ts:
  - all schemas from contracts/server-actions.md;
  - the server-side path check helper `isOwnSubmissionPath(path, studentId, lessonId)` (data-model.md Submission.attachments);
  - the body limit (data-model.md Submission.body_md).

  Import `MAX_CONTENT_BYTES` and `utf8Bytes` from src/features/courses/schemas.ts for now (T037 moves them). T005 passes.
- [ ] T012 [P] Create src/features/progress/types.ts (`z.infer` and Prisma-derived types only; contracts/route-handlers.md shared types) and src/features/progress/queries.ts. The latter is a query-key factory covering every key in the contracts/server-actions.md invalidation table (`['lesson',id,'work']`, `['lesson',id,'notes',studentId]`, `['focus']`, `['progress',view]`, `['progress','summary']`, `['admin','students',…]`). No `queryOptions` yet; stories add them.
- [ ] T013 [P] Create the `ProgressBar` component in src/components/shared/progress-bar.tsx (contracts/ui-routes.md › Shared components). Props: `{ percent: number | null; accent?: CourseAccent; label: string }`. It uses theme tokens and is 8 px tall. T006 passes.
- [ ] T014 [P] Extend the e2e fixtures in tests/e2e/fixtures/courses.ts:
  - `markDone(studentId, lessonId, { completedAt?, completedBy?, minutesSpent? })`, keeping the old two-argument call working (data-model.md LessonProgress.completed_at, LessonProgress.completed_by, LessonProgress.minutes_spent);
  - `seedSession(studentId, lessonId, { startedAt, plannedMinutes, endedAt? })` (data-model.md StudySession.started_at, StudySession.planned_minutes, StudySession.ended_at);
  - `seedComment({ authorId, studentId, targetType, targetId, body })`;
  - `seedSubmission` gains optional `bodyMd`.

  Extend tests/e2e/global-teardown.ts to delete the run's `comments`, `study_sessions` and `audit_log` rows before the users, because `audit_log.actor_id` doesn't cascade.

**Checkpoint**: the migration is applied, policies are tested, guards are ready, schemas are tested. Stories can start.

---

## Phase 3: User Story 1 – Mark a lesson complete (Priority: P1) 🎯 MVP

**Goal**: students mark lessons complete and undo; locks and course % follow at once. Admins mark done or reopen for a student, and it is audited.

**Independent Test**: as a student, open lesson 1 and tap Mark complete:
- the bar shows Done at once;
- lesson 2 opens;
- the Courses card and course screen show the new % and "1 of N".

Undo returns it. On a "submit before complete" lesson the Assignment tab opens with the banner. As the Admin, Mark done on the review screen: the student sees "Marked done by {admin}" and `audit_log` has the row.

### Tests for User Story 1 (write first, see them fail)

- [ ] T015 [P] [US1] Write unit tests in src/features/progress/completion.test.ts for `completionBlock()` (research.md R1):
  - locked → `lesson_locked`; course not Active → `course_not_active`;
  - `require_submission` with no submission or a Draft → `submission_required`;
  - with `submitted`, `reviewed` or `needs_redo` → allowed (data-model.md Submission.status);
  - the Admin path ignores `require_submission`.
- [ ] T016 [P] [US1] Add lock cases to src/features/courses/lock.test.ts (research.md R1):
  - with in-order unlocking, lesson 6 done and lesson 5 not done → lesson 6 is open, and lesson 7 is open because its previous visible lesson (6) is done;
  - a not-done lesson after a not-done lesson stays locked;
  - the existing cases are unchanged.
- [ ] T017 [P] [US1] Write tests against the dev database in src/features/progress/repo.test.ts (create the file with the node environment, 60 s timeout and the user and link setup and cleanup of src/features/assignments/repo.test.ts):
  - complete sets `done`, `completed_at`, `completed_by` = student (data-model.md LessonProgress.status, LessonProgress.completed_at, LessonProgress.completed_by);
  - `minutes_spent` = `est_minutes` when the student has no session for the lesson, 0 when they have one (data-model.md LessonProgress.minutes_spent);
  - completing twice keeps the first `completed_at`;
  - undo → `not_started` with no session, `in_progress` with one, and the credit cleared;
  - the Admin's done or reopen writes `completed_by` = admin plus one `audit_log` row (`lesson.complete` / `lesson.reopen`, target `{ studentId, lessonId }`), all in one transaction;
  - `course_progress.percent` reflects completion;
  - `getLessonWork` returns `completedByName` only when the completer isn't the student, and `nextLessonId` in course order.
- [ ] T018 [P] [US1] Write Playwright tests in tests/e2e/us1-complete.spec.ts (390×844 and 1280×800, axe):
  - scenario 1: mark complete → the bar changes before the response; lesson 2 opens; the Courses card shows % and "1 of N"; the course screen card shows the same;
  - scenario 2: on the `require_submission` lesson → the Assignment tab is selected with the banner and nothing is completed;
  - scenario 3: undo → % goes back;
  - scenario 4: the Admin marks done on `/a/students/[id]/lessons/[lessonId]` → the student sees "Marked done by {name}"; Reopen; both are audited (checked with `sql`);
  - Edge Case: undoing lesson 1 while lesson 2 is done keeps lesson 2 open;
  - SC-001: after Mark complete, open Today and Courses and check that the new progress shows within 1 s of each page opening.

### Implementation for User Story 1

- [ ] T019 [US1] Add the "done lesson is always open" rule to `computeLocks()` in src/features/courses/lock.ts, before the `after_previous` check, and update the header comment (research.md R1; spec Edge Cases). T016 passes.
- [ ] T020 [P] [US1] Implement `completionBlock()` in src/features/progress/completion.ts as a pure function of `{ role, locked, courseActive, requireSubmission, submissionStatus }` (research.md R1). T015 passes.
- [ ] T021 [US1] Implement the completion repo in src/features/progress/repo.ts:
  - `completeLesson(student, lessonId)` and `undoCompletion(student, lessonId)`;
  - `setLessonDone(admin, studentId, lessonId, done)`, in a `prisma.$transaction` with the `audit_log` insert;
  - `getLessonWork(student, lessonId)` (progress part: `completedByName`, `minutes` = credit + counted session seconds / 60, `nextLessonId` via 002's order helpers; `submission: null`, `reviewComments: []`, `notesCount: 0` until US2).

  Follow the lifecycles in data-model.md › Lesson progress (data-model.md LessonProgress.student_id, LessonProgress.lesson_id, LessonProgress.updated_at (set on every write), LessonProgress.status, LessonProgress.completed_at, LessonProgress.completed_by, LessonProgress.minutes_spent). T017 passes.
- [ ] T022 [US1] Add the Server Actions `completeLesson`, `undoCompletion` and `setLessonDone` in src/features/progress/actions.ts (contracts/server-actions.md › Completion). Each starts with its guard: `requireRole('student')` + `requireLessonReader` + 002's `placeStudentLesson`, or `requireAdminLessonTarget`. Then check `completionBlock()`, then the repo. Use `action()` and `fail(code)`.
- [ ] T023 [US1] Add Route Handler GET src/app/api/lessons/[lessonId]/work/route.ts (`handle()`, guards as in contracts/route-handlers.md, 404 `lesson_not_found` / 403 `lesson_locked`). Add `lessonWorkQuery(id)` to src/features/progress/queries.ts.
- [ ] T024 [US1] Course progress for students in src/features/courses/student-repo.ts:
  - `percent` and `doneCount` on active cards from `course_progress`, in one `$queryRaw` for all of the student's courses;
  - `course.progress` on the course screen.

  Update the types in src/features/courses/types.ts and add assertions to src/features/assignments/student-repo.test.ts, which already covers these endpoints. Contracts: route-handlers.md › Changed endpoints.
- [ ] T025 [US1] Admin reads in src/features/progress/admin-repo.ts:
  - `getStudentCards(admin)`: id, name, time zone, `courses: CourseProgress[]`, from one link query plus one `course_progress` query;
  - `getStudentDetail(admin, studentId)`: courses with Published lessons in order, `done`, `submission: null` and `toReview: []` until US2;
  - `getAdminLesson(admin, studentId, lessonId)`: lesson, `courseActive`, progress; `submission: null` until US2.

  Route Handlers:
  - GET src/app/api/admin/students/progress/route.ts (`requireRole('admin')`);
  - GET src/app/api/admin/students/[studentId]/route.ts (`requireAdminOf`);
  - GET src/app/api/admin/students/[studentId]/lessons/[lessonId]/route.ts (`requireAdminLessonTarget`).

  Add their `queryOptions` in queries.ts. Contracts: route-handlers.md › Admin.
- [ ] T026 [P] [US1] Student lesson components in src/features/progress/components/:
  - `lesson-work-tabs.tsx`: shadcn `Tabs` with `?tab=lesson|assignment|notes` in the URL. The Assignment tab only when there's a prompt; for now it shows the rendered prompt and the `submission_required` banner. The Notes tab label shows the count. The Lesson tab takes 002's lesson content as `children`.
  - `lesson-bottom-bar.tsx`: the states in contracts/ui-routes.md › Bottom bar, without the timer. `useMutation` with an optimistic update and rollback on `['lesson',id,'work']`, invalidating the keys in contracts/server-actions.md. On `submission_required` it switches to the Assignment tab instead of a toast.
- [ ] T027 [US1] Wire the lesson page src/app/s/lessons/[lessonId]/page.tsx:
  - prefetch `lessonWorkQuery` next to 002's lesson query;
  - wrap 002's `StudentLessonView` content in `LessonWorkTabs`;
  - render `LessonBottomBar`.

  Keep 002's `LockedLesson` path unchanged. Remove the "writing and submitting come with 004" comment in src/features/courses/components/student-lesson-view.tsx.
- [ ] T028 [P] [US1] Show progress on the student Courses list and course screen:
  - src/features/courses/components/student-course-list.tsx: `ProgressBar` in the course accent, "{percent}%" ("—" when null), "{done} of {total}" before 003's due text;
  - the course screen header: a progress card ("{percent}%", bar, "{done} of {total} lessons").

  Update the stale "come with 004" comments.
- [ ] T029 [US1] Admin screens:
  - src/app/a/(tabs)/students/page.tsx: one `StudentProgressCard` per linked student (src/features/progress/components/student-progress-card.tsx: avatar, name, course bars; the whole card is a link) under 001's invite and request cards;
  - new src/app/a/students/[studentId]/page.tsx with `StudentDetail` (student-detail.tsx);
  - new src/app/a/students/[studentId]/lessons/[lessonId]/page.tsx with `LessonReview` (lesson-review.tsx: header, Tabs shell) and `ReviewBar` (review-bar.tsx: Mark done / "Done · {date} by {name}" + Reopen, hidden when `courseActive` is false; optimistic, as in T026).
- [ ] T030 [US1] Add the `lessonWork` strings (tabs, bottom bar states, banner, "Marked done by {name}", Next lesson) and the `adminStudents` strings (card, detail, review shell, Mark done, Reopen) to src/i18n/messages/en.json, my.json and ja.json. Add `errors.submission_required`. All three files must have the same keys.
- [ ] T031 [US1] Run T015–T018 until they pass. Run 002's and 003's e2e specs that touch the lesson page and the Courses list (`us4-student-reads`, `us3-student-due`) to check nothing regressed.

**Checkpoint**: US1 works and can be demoed on its own.

---

## Phase 4: User Story 2 – Write and submit an assignment (Priority: P1)

**Goal**: drafts autosave with text and up to 5 photos; Submit; the Admin sees it live, reviews with a comment (Reviewed / Needs redo), and the student sees it live and resubmits. Notes threads work for both sides. Notices are recorded for 006.

**Independent Test**: as a student:
- write a draft and add 2 photos; reload and the draft is kept;
- Submit. An already-open Admin Students screen shows "1 to review" within 5 s with no reload.

As the Admin, comment and choose Needs redo; the student's open lesson shows it within 5 s. The student edits and resubmits. Completion and % never change. Both sides see Notes.

### Tests for User Story 2 (write first, see them fail)

- [ ] T032 [P] [US2] Write unit tests in src/features/progress/submission-status.test.ts covering every row and every disallowed move of the transition table in research.md R7 / data-model.md › Submission (data-model.md Submission.status): `canStudentEdit`, `studentNext('save' | 'submit')`, `adminCanReview(from, to)`.
- [ ] T033 [P] [US2] Add tests against the dev database to src/features/progress/repo.test.ts (data-model.md Submission.body_md, Submission.attachments, Submission.status, Submission.submitted_at, Submission.reviewed_at, Comment.target_type, Comment.target_id):
  - `saveDraft` creates a `draft`, then updates it keeping the status (also in `needs_redo`); it refuses in `submitted`/`reviewed` with `submission_locked` and a path outside `<student>/<lesson>/`;
  - `submitAssignment` sets `submitted_at` and clears `reviewed_at`; an empty body and no images give `submission_empty`;
  - `reviewSubmission` sets `reviewed_at`, inserts the optional comment with target `submission`, and leaves `lesson_progress` unchanged before and after;
  - notices: one `submitted` row per actively linked Admin, replaced and unread again on resubmit; one `reviewed` row for the student, in the student's locale (data-model.md › Notifications recorded by 004);
  - `postNote` by the student and by the Admin; `getNotes` oldest first, capped at 200;
  - `getLessonWork` now returns the submission, review comments and `notesCount`.
- [ ] T034 [P] [US2] Add a case to src/features/courses/purge.test.ts: purging a lesson also deletes `comments` that target it (`lesson`) and its submissions (`submission`) (research.md R8; data-model.md Comment.target_id).
- [ ] T035 [P] [US2] Write a unit test in src/lib/realtime.test.ts (mocked browser client): `useRealtimeInvalidate` subscribes to `postgres_changes` with the given table and filter, invalidates every given key on an event, and removes the channel on unmount.
- [ ] T036 [P] [US2] Write Playwright tests in tests/e2e/us2-submit.spec.ts (390×844 and 1280×800, axe):
  - scenario 1: type, wait for "Draft saved", reload and the text is kept; add 2 images from tests/e2e/fixtures/files/ (one larger than 2 MB before resizing) and check each stored object is ≤ 2 MB with `sql` on `storage.objects`;
  - scenario 2: two browser contexts; the Admin's `/a/students` is already open; the student submits → "1 to review" appears within 5 s with no reload; the editor becomes read-only;
  - scenario 3: the Admin comments + Needs redo → the student's open lesson shows the banner and comment within 5 s;
  - scenario 4: the student edits and resubmits → Submitted; the course % is unchanged throughout;
  - scenario 5: Notes both ways, "Notes · 2"; a second linked student doesn't see the thread;
  - the Admin never sees a Draft (detail chip empty; the file URL gives 404).

### Implementation for User Story 2

- [ ] T037 [US2] Shared moves, no behaviour change, one commit (plan.md › Structure Decision):
  - `MdTextarea` from src/features/courses/components/md-textarea.tsx to src/components/shared/md-textarea.tsx (update lesson-editor.tsx and the mock path in lesson-editor.test.tsx);
  - `fitWithin`, `resizeImage` (now exported) and `MAX_IMAGE_EDGE` from src/features/courses/upload.ts to src/lib/image.ts;
  - `MAX_CONTENT_BYTES` and `utf8Bytes` from src/features/courses/schemas.ts to src/lib/content.ts; update src/features/progress/schemas.ts;
  - `textsFor` from src/features/assignments/notices.ts to src/server/notifications/texts.ts as `textsFor(recipient)`.

  All existing tests pass unchanged.
- [ ] T038 [P] [US2] Implement src/features/progress/submission-status.ts (research.md R7; data-model.md Submission.status). T032 passes.
- [ ] T039 [P] [US2] Notice texts in src/features/progress/notices.ts: `submittedNotice(admin, student, lesson)` and `reviewedNotice(student, lesson, status)`, using `textsFor(recipient)` and the `notices` namespace, with sourceId = submission id and the keys and urls in data-model.md › Notifications recorded by 004.
- [ ] T040 [US2] Repo in src/features/progress/repo.ts: `saveDraft`, `submitAssignment` (with the notices), `reviewSubmission` (one transaction: status, `reviewed_at`, optional comment, notice), `postNote` and `getNotes`. Extend `getLessonWork` with `submission`, `reviewComments` and `notesCount`; attachment `url` = `/api/submissions/<id>/files/<basename>`. Field rules: data-model.md Submission.student_id, Submission.lesson_id (one row per pair; the lesson has a prompt), Submission.body_md, Submission.status, Submission.submitted_at, Submission.reviewed_at, Submission.attachments, Comment.author_id, Comment.student_id, Comment.target_type, Comment.target_id (`lesson` for Notes, `submission` for review comments), Comment.body, Comment.created_at (threads oldest first). T033 passes.
- [ ] T041 [US2] Extend src/features/progress/admin-repo.ts:
  - `toReview` count on cards;
  - detail `toReview` list (oldest first) and per-lesson submission chips (a Draft shows as null);
  - `getAdminLesson` with the non-Draft submission and review comments.

  Contracts: route-handlers.md › Admin.
- [ ] T042 [US2] Delete comments in src/features/courses/purge.ts for each purged lesson and its submissions, matching on data-model.md Comment.target_type and Comment.target_id (no foreign key), in the same transaction as the lesson delete. T034 passes.
- [ ] T043 [US2] Add the Server Actions `saveDraft`, `submitAssignment`, `reviewSubmission` and `postNote` to src/features/progress/actions.ts (contracts/server-actions.md › Submissions, Notes). Guards first: student lesson guards, `requireSubmissionReviewer`, or `requireAdminLessonTarget`. Student actions never accept another `studentId`.
- [ ] T044 [US2] Route Handlers:
  - GET src/app/api/lessons/[lessonId]/notes/route.ts (student or admin guard per contracts/route-handlers.md);
  - GET src/app/api/submissions/[submissionId]/files/[name]/route.ts (owner or `requireSubmissionReviewer`; basename must match an attachment; 302 to a 1-hour signed URL made with `createServerClient()`, as src/app/api/lesson-files/[resourceId]/[name]/route.ts does).

  Add `notesQuery` to queries.ts.
- [ ] T045 [P] [US2] Implement `useRealtimeInvalidate({ table, filter?, queryKeys })` in src/lib/realtime.ts with the browser client from src/lib/supabase/client.ts (research.md R10). T035 passes.
- [ ] T046 [P] [US2] Image upload in src/features/progress/upload.ts:
  - `uploadSubmissionImage(studentId, lessonId, file)` resizes with src/lib/image.ts, refuses results over 2 MB (`file_too_large`), and uploads to `submissions/<studentId>/<lessonId>/<uuid>.<ext>` (data-model.md Submission.attachments);
  - `removeSubmissionImage(path)`;
  - map an offline failure to `offline`.
- [ ] T047 [US2] Student components in src/features/progress/components/:
  - `assignment-editor.tsx`: `MdTextarea` loaded on demand; local text state; autosave 1.5 s after the last keystroke and on `visibilitychange`; "Saving…" / "Draft saved · {time}"; Submit; the Needs redo banner;
  - `image-strip.tsx`: up to 5 images, "Add photo", remove buttons with `aria-label`;
  - `submission-view.tsx`: read-only Markdown and images;
  - `comment-list.tsx`;
  - `note-composer.tsx`: counter after 1800 characters.

  Put them into the Assignment and Notes tabs of `lesson-work-tabs.tsx`. Add the assignment card on the Lesson tab (contracts/ui-routes.md › Lesson). Subscribe with `useRealtimeInvalidate` to `submissions` and `comments` filtered by `student_id=eq.<me>` (research.md R10).
- [ ] T048 [US2] Admin components:
  - `lesson-review.tsx` Assignment tab: collapsed prompt, `SubmissionView`, submitted time via `TimeBoth` in the student's zone, review comments, comment box, Needs redo and Reviewed buttons with optimistic status;
  - Notes tab with `CommentList` and `NoteComposer`;
  - `student-detail.tsx` "To review · n" list and submission chips (`StatusChip` tones);
  - `student-progress-card.tsx` "{n} to review" chip.

  Realtime subscriptions on `/a/students` and the review screen per research.md R10.
- [ ] T049 [US2] Add the `submission` and `notes` strings, the `notices.submitted*` and `notices.reviewed*` / `notices.needsRedo*` texts, `errors.submission_locked`, `submission_empty`, `submission_not_found`, `invalid_transition`, `too_many_images`, and `validation.commentRequired`, `commentTooLong` to src/i18n/messages/en.json, my.json and ja.json.
- [ ] T050 [US2] Run T032–T036 until they pass, plus 002's lesson-editor tests after the move.

**Checkpoint**: US1 and US2 both work on their own.

---

## Phase 5: User Story 3 – See progress (Priority: P1)

**Goal**: streak (current and best), study time, lessons done vs the previous period, heat calendar, weekly goal and a finish forecast per course on Progress; streak, goal and Continue cards on Today; "Studied this week" on Courses; full student cards for the Admin.

**Independent Test**: seed 6 active days ending today and a best run of 9.
- Progress (Month) shows "6 · Best: 9", shaded days, "Weekly goal: n of 5 days", and an On track / Behind forecast that matches the last 14 days.
- Week view shows 7 bars.
- Today shows the streak and goal cards and Continue.
- The Admin card shows streak, this week's time, lessons done, bars and the overdue chip.
- Changing the goal on Me updates the labels.

### Tests for User Story 3 (write first, see them fail)

- [ ] T051 [P] [US3] Write unit tests in src/features/progress/streak.test.ts (research.md R4):
  - `isActiveDay` at 599 s vs 600 s, and with 1 completion;
  - `currentStreak` with today active, with today not yet active (yesterday's run counts), and broken two days ago → 0;
  - `bestStreak`;
  - `weekActiveDays` Mon–Sun beyond the goal;
  - date sequences for Asia/Tokyo, Asia/Yangon, America/New_York including the November daylight-saving week.
- [ ] T052 [P] [US3] Write unit tests in src/features/progress/forecast.test.ts for the six outcomes and rounding in research.md R6: `empty`, `finished`, `no_pace`, `no_deadline`, `on_track` on the due date itself, `behind` by one day; and `ceil` for a fractional pace.
- [ ] T053 [P] [US3] Write unit tests in src/features/progress/heat.test.ts: level boundaries 0, 1 s, 14:59, 15:00, 29:59, 30:00, 59:59, 60:00.
- [ ] T054 [P] [US3] Add tests against the dev database to src/features/progress/repo.test.ts (data-model.md StudySession.started_at, StudySession.ended_at, StudySession.planned_minutes, LessonProgress.completed_at, LessonProgress.minutes_spent):
  - `dailyActivity`: a completion at 23:30 and one at 00:30 Tokyo time give two dates; a New York day across the daylight-saving change groups correctly;
  - a session counts on its local start date;
  - an open session past its plan counts `planned_minutes`;
  - the completion credit lands on the completion date;
  - the admin version returns all students in one query.

  Add to src/features/assignments/student-repo.test.ts: `countOverdue(studentIds, now)` matches the per-course `overdueCount` sums from 003.
- [ ] T055 [P] [US3] Write Playwright tests in tests/e2e/us3-progress.spec.ts (390×844 and 1280×800, axe; history seeded with `markDone` and `seedSession`):
  - scenario 1: the Month view's cards, heat calendar (accessible names "…, 45 min studied") and goal label;
  - Week toggle in the URL;
  - scenario 2: the forecast text for a course with a deadline (On track) and one behind;
  - scenario 3: the Admin card's tiles, bars and overdue chip;
  - Today's streak, goal dots and Continue;
  - the Courses "Studied this week" card;
  - the weekly goal sheet on Me changes "of 5" to "of 3";
  - Edge Case: a course with 0 published lessons shows "—".

### Implementation for User Story 3

- [ ] T056 [P] [US3] Implement src/features/progress/streak.ts (research.md R4). T051 passes.
- [ ] T057 [P] [US3] Implement src/features/progress/forecast.ts (research.md R6), using the student's course deadline (`course_assignments.due_at`), not `courses.target_date`. T052 passes.
- [ ] T058 [P] [US3] Implement src/features/progress/heat.ts. T053 passes.
- [ ] T059 [US3] Repo in src/features/progress/repo.ts:
  - `dailyActivity(studentId, timeZone, from, to)`: one `$queryRaw` that unions counted session seconds (capped formula, data-model.md › Derived values) and completions with `minutes_spent`, grouped by `(ts at time zone $tz)::date`;
  - `dailyActivityForStudents(studentIds, from, to)`, which joins `profiles.timezone`;
  - `getProgress(student, view)` and `getSummary(student)`, including `continue` (research.md R13).

  Add `countOverdue(studentIds, now)` to src/features/assignments/student-repo.ts. Extend `getStudentCards` in src/features/progress/admin-repo.ts with streak, `weekSeconds`, `weekLessonsDone` and `overdueCount`, without N+1. T054 passes.
- [ ] T060 [US3] Route Handlers GET src/app/api/progress/route.ts (`view` parsed with Zod, defaults to `month`) and GET src/app/api/progress/summary/route.ts, both `requireRole('student')`. Extend the admin cards route output. Add `progressQuery(view)` and `summaryQuery()` to queries.ts.
- [ ] T061 [US3] Weekly goal:
  - `setWeeklyGoal` action and schema in src/features/profile/actions.ts and src/features/profile/schemas.ts (`requireRole('student')`);
  - `WeeklyGoalSheet` in src/features/profile/components/weekly-goal-sheet.tsx;
  - the "Weekly goal · {n} days" row on the Me screen (src/features/profile/components/me-view.tsx);
  - `weeklyGoalDays` added to the `me` payload in src/features/profile/repo.ts.
- [ ] T062 [P] [US3] Add `WeekBars` in src/components/shared/week-bars.tsx with a component test week-bars.test.tsx: 7 bars relative to the week's maximum, today bold, empty days as a 4 px stub, accessible text per day. Add the `--heat-1..4` tokens to src/app/globals.css (`color-mix` from `--primary`, as `--avail-*`) and extend the existing token contrast test.
- [ ] T063 [US3] Add the heat cells to src/components/shared/calendar-month.tsx: use the existing badge slot if it can fill the cell, otherwise add a `renderDay` slot. Extend its test; keep the Plan month (003) unchanged.
- [ ] T064 [US3] Progress screen: src/app/s/(tabs)/progress/page.tsx replaces `TabPlaceholder`, prefetches `progressQuery`, and renders `ProgressView`. Components in src/features/progress/components/: `progress-view.tsx` (`Segmented` Week/Month in the URL), `stat-cards.tsx`, `heat-calendar.tsx`, `forecast-list.tsx` (texts and tones per contracts/ui-routes.md › Progress).
- [ ] T065 [US3] Today and Courses cards:
  - `streak-card.tsx`, `week-goal-card.tsx` (7 dots) and `continue-card.tsx` added to src/app/s/(tabs)/today/page.tsx above 003's sections, from `summaryQuery`;
  - `studied-week-card.tsx` (`WeekBars` + "{n} lessons done") added to src/app/s/(tabs)/courses/page.tsx from `progressQuery('week')`.

  Remove the stale "come later" comments in today-view.tsx and student-course-list.tsx.
- [ ] T066 [US3] Admin card tiles in student-progress-card.tsx: streak, "This week", "Lessons done", and the "{n} overdue" danger chip. Also subscribe to `lesson_progress` on `/a/students`.
- [ ] T067 [US3] Add the `progress` strings (cards, legend, forecast texts, month and week comparisons), `todayProgress` (streak, goal, Continue), `weeklyGoal`, and the `adminStudents` tile strings to src/i18n/messages/en.json, my.json and ja.json. Duration and date formats come from next-intl, per locale.
- [ ] T068 [US3] Run T051–T055 until they pass.

**Checkpoint**: US1–US3 all work on their own. This is the feature's MVP.

---

## Phase 6: User Story 4 – Focus timer logs study time (Priority: P2)

**Goal**: "Focus 15" or 25 on a lesson runs a countdown. Stopping or finishing adds the minutes to the lesson and the day. A timer left running while the app is closed counts up to its length.

**Independent Test**: start Focus 15 and let it finish: the toast says "15 min added" and the lesson's minutes grow by 15 (today's total too, once US3 is built). Stop a timer within seconds: nothing is counted. Seed a session that started 3 h ago: on opening the app no timer runs and exactly 15 min is counted.

### Tests for User Story 4 (write first, see them fail)

- [ ] T069 [P] [US4] Write unit tests in src/features/progress/focus.test.ts (research.md R3; data-model.md StudySession.planned_minutes, StudySession.ended_at):
  - `countedSeconds(startedAt, endedAt | null, plannedMinutes, now)` is capped at the plan and runs on while open;
  - `remainingSeconds` uses a server clock offset;
  - `shouldDiscard` is true below 60 s.
- [ ] T070 [P] [US4] Add tests against the dev database to src/features/progress/repo.test.ts (data-model.md StudySession.started_at, StudySession.ended_at, StudySession.planned_minutes, StudySession.lesson_id):
  - `startFocus` stamps server time, closes an earlier open session at its planned end, and sets `lesson_progress` to `in_progress` unless it is done;
  - `stopFocus` caps `ended_at` and deletes a session under 60 s;
  - stopping an already-closed session returns its seconds;
  - `getActiveSession` returns null for an expired open session;
  - a later undo leaves `in_progress` (US1 rule).
- [ ] T071 [P] [US4] Write Playwright tests in tests/e2e/us4-focus.spec.ts (390×844, axe):
  - scenario 1: seed a session started 14 min 50 s ago; open the lesson → the countdown shows about 0:10, reaches 0 and stops itself; the toast appears; the lesson minutes and the Progress week bar grow;
  - Stop after a few seconds → nothing counted;
  - scenario 2: seed a session started 3 h ago → no timer; Progress counts 15 min;
  - a timer running on another lesson shows "Focus running · {lesson}".

### Implementation for User Story 4

- [ ] T072 [P] [US4] Implement src/features/progress/focus.ts (research.md R3). T069 passes.
- [ ] T073 [US4] Repo in src/features/progress/repo.ts: `startFocus` (one transaction), `stopFocus` and `getActiveSession` (data-model.md › Study session lifecycle; StudySession.lesson_id, StudySession.started_at, StudySession.ended_at, StudySession.planned_minutes). T070 passes.
- [ ] T074 [US4] Add the Server Actions `startFocus` and `stopFocus` to src/features/progress/actions.ts (contracts/server-actions.md › Focus timer; guards first). Add Route Handler GET src/app/api/focus/route.ts (`requireRole('student')`, returns `now` and the open session) and `focusQuery()` in queries.ts.
- [ ] T075 [US4] Timer UI:
  - `useCountdown` in src/features/progress/use-countdown.ts: ticks every 1 s from `startedAt` + `plannedMinutes` adjusted by the server offset, and calls `stopFocus` at 0;
  - `focus-button.tsx`: "Focus 15" with a ▾ menu for 15 / 25 min (shadcn `dropdown-menu`), the "mm:ss · Stop" state (`aria-live` announces each minute), and "Focus running · {lesson}";
  - wire it into `lesson-bottom-bar.tsx` with optimistic `['focus']` updates and the invalidations in contracts/server-actions.md;
  - the toast "Focus done · {n} min added", vibrating only when supported and the user hasn't asked for reduced motion.
- [ ] T076 [US4] Add the focus strings in `lessonWork` (button, menu, running, stop, toast) and `errors.session_not_found` to src/i18n/messages/en.json, my.json and ja.json.
- [ ] T077 [US4] Run T069–T071 until they pass.

**Checkpoint**: all four stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T078 [P] Documentation (plan.md › Documentation updates):
  - docs/data-model.md: `minutes_spent` meaning, `planned_minutes`, new indexes and checks, §4 replaced policies and bucket limits, §5 `requireAdminLessonTarget` and `requireSubmissionReviewer`, §6 Realtime tables;
  - docs/technical-spec.md: §3 `features/progress`, `lib/realtime.ts`, `lib/image.ts`, `lib/content.ts`; §7 `useRealtimeInvalidate` as built; drop "open question in spec 004" from the streak line; §12 the `--heat-*` tokens and `WeekBars` / `ProgressBar`.
- [ ] T079 [P] Review every new `my` and `ja` string for completeness and tone. List the strings that need a native speaker under a `_review` note in specs/004-progress-assignments/quickstart.md, as 003 did.
- [ ] T080 [P] Accessibility and layout pass at 390×844 and 1280×800:
  - 44 px targets; tablist keyboard use; labelled image buttons and heat cells;
  - focus order in the editor and the review screen;
  - the timer announcing once a minute;
  - contrast of the heat levels and forecast tones in light and dark.

  Fix findings in src/features/progress/components/ and src/components/shared/.
- [ ] T081 Compare each changed screen with screenshots/10-Lesson.png, 06-Progress.png, 04-Today.png, 05-Courses.png, 11-Profile.png and 16-AdminStudents.png at 390×844. Fix layout, hierarchy and copy, keeping only the "partial" differences listed in contracts/ui-routes.md.
- [ ] T082 Performance:
  - Lighthouse (mobile) performance ≥ 90 on `/s/progress` and `/s/lessons/[id]`;
  - `MdTextarea` is absent from the lesson page's first-load JS until the Assignment tab opens;
  - `/a/students` runs a fixed number of queries for 10 seeded students (check the Prisma query log);
  - `/s/progress` is one request with two grouped SQL queries plus `course_progress` (plan.md › Performance Goals).

  Record the results in specs/004-progress-assignments/quickstart.md §5, as 003 did.
- [ ] T083 Run every gate from the package.json scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e` (production build on :3100), `pnpm build`.
- [ ] T084 Walk through quickstart.md §4 scenarios 1–12 and record, for each one, the test that covers it or what wasn't checked, as in 003's walkthrough.
- [ ] T085 Set **Status** to `Implemented` in specs/004-progress-assignments/spec.md (constitution quality gate).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none. T002 before T007.
- **Foundational (2)**: after Setup; blocks every story.
  - T007 before T008.
  - T008 before T010 and all repo tests (generated client and policies).
  - T009 before T010 (same file).
  - T011 and T012 before any story's actions or queries.
- **US1 (3)**: after Foundational.
- **US2 (4)**: after US1. It fills the Assignment and Notes tabs and the admin review screen that US1 creates, and extends `getLessonWork`, `admin-repo.ts` and `actions.ts`.
- **US3 (5)**: after Foundational. It extends the admin cards endpoint and `StudentProgressCard` from T025/T029; if US1 isn't done, create them with only US3's fields. It can run alongside US2; then T066 waits for T048, because both edit `student-progress-card.tsx`.
- **US4 (6)**: after US1 (bottom bar). Its Progress check (T071) needs US3's `dailyActivity`; without US3, check the lesson minutes only.
- **Polish (7)**: after the stories you're shipping.

### Within each story

Tests first and failing → pure modules → repo → actions and route handlers → components → pages → strings → story tests pass.

### Shared files (no [P] between these tasks)

- src/server/auth/guards.ts: T009 → T010
- src/features/progress/repo.ts: T021 → T040 → T059 → T073
- src/features/progress/repo.test.ts: T017 → T033 → T054 → T070
- src/features/progress/actions.ts: T022 → T043 → T074
- src/features/progress/admin-repo.ts: T025 → T041 → T059
- src/features/progress/queries.ts: T012 → T023 → T025 → T044 → T060 → T074
- src/features/progress/components/lesson-work-tabs.tsx: T026 → T047
- src/features/progress/components/lesson-bottom-bar.tsx: T026 → T075
- src/features/progress/components/student-progress-card.tsx: T029 → T048 → T066 (without US2, T066 follows T029)
- src/features/progress/components/lesson-review.tsx: T029 → T048
- src/features/progress/schemas.ts: T011 → T037
- src/features/assignments/student-repo.ts / .test.ts: T024 → T054 → T059
- src/i18n/messages/*.json: T030, T049, T067, T076 (one at a time)

### Parallel opportunities

- Foundational tests T003–T006 together; then T011–T014 together while T007–T010 run in order.
- US1: T015–T018 together; T020 and T026 alongside T021–T025; T028 alongside T027.
- US2: T032–T036 together; T038, T039, T045 and T046 together after T037.
- US3: T051–T055 together; T056–T058 and T062 together; the whole phase alongside US2, keeping the shared-file order.
- US4: T069–T071 together; T072 alongside the repo work.

---

## Parallel Example: Foundational tests

```bash
Task: "pgTAP supabase/tests/004_progress_policies.test.sql"
Task: "Guard tests src/server/auth/guards.test.ts"
Task: "Schema tests src/features/progress/schemas.test.ts"
Task: "Component test src/components/shared/progress-bar.test.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "Unit tests src/features/progress/streak.test.ts"
Task: "Unit tests src/features/progress/forecast.test.ts"
Task: "Unit tests src/features/progress/heat.test.ts"
Task: "Playwright tests/e2e/us3-progress.spec.ts"
# then
Task: "streak.ts" ; Task: "forecast.ts" ; Task: "heat.ts" ; Task: "WeekBars + --heat tokens"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup and Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** with quickstart scenarios 1–3 and 8.
3. Phase 4 (US2). Validate with scenarios 4–7.
4. Phase 5 (US3). Validate with scenarios 10–11. US1–US3 together are 004's part of the app MVP (001–004 + basic 006).

### Incremental delivery

5. US4 (focus timer): scenario 9.
6. Polish, then merge `004-progress-assignments` into `main`.

Implement in small batches (`/speckit-implement Phase 1`, `… T003–T006`, …), reviewing each diff and running tests before the next batch.

---

## Notes

- [P] = different files and no dependency on unfinished tasks.
- Every new Route Handler and Server Action starts with a guard; there are no exceptions in 004.
- Notices are stored only; nothing is pushed until 006 (spec FR-009).
- Shared moves (T009, T037) are commits of their own with no behaviour change.
- Commit after each task group. Commit `schema.prisma` and the migration together (docs/data-model.md §7).
