# Research: Completion, Assignments and Progress (004)

This is Phase 0 of the plan. Each item gives the decision, the rationale and the alternatives considered.

It builds on:
- `prisma/migrations/0_init`, which already has `lesson_progress`, `submissions`, `comments`, `study_sessions`, `audit_log`, the `course_progress` view, the private `submissions` bucket and their RLS;
- 002 and 003 as built;
- the spec as clarified on 2026-11-22.

No new npm packages are needed (R16).

## R1. Completion: four actions, one set of rules

- **Decision**: Completion has four Server Actions in `src/features/progress/actions.ts`. The rules are in a pure function, `completionBlock()` in `progress/completion.ts`, which is unit-tested.
  - `completeLesson({ lessonId })` (student):
    - Guard: `requireLessonReader`, then 002's `placeStudentLesson`, which fails with 403 `lesson_locked`.
    - The course must be **Active**; otherwise it fails with `course_not_active`. Archived courses are read-only (002).
    - When the lesson has `require_submission` and the student has no submission, or only a Draft, it fails with `submission_required`. The client then opens the Assignment tab and shows a message (US1 scenario 2).
    - A submission in Needs redo still counts as "a submission exists" (spec FR-004: a review never changes completion).
    - If the lesson isn't done yet, it upserts `lesson_progress` with `status = 'done'`, `completed_at = now()`, `completed_by = me` and `minutes_spent` from R2. Completing an already-done lesson changes nothing, so a double tap is harmless.
  - `undoCompletion({ lessonId })` (student): same guard, Active course. Sets `status` back to `in_progress` if the student has any focus session on the lesson, otherwise `not_started`. Clears `completed_at`, `completed_by` and `minutes_spent`.
  - `setLessonDone({ studentId, lessonId, done })` (Admin marks done or reopens, FR-002):
    - Guard: `requireAdminLessonTarget(lessonId, studentId)` (R11), plus an Active course.
    - Writes the same row changes as above, with `completed_by = admin`.
    - In the same transaction it inserts an `audit_log` row: `action` is `lesson.complete` or `lesson.reopen`, `target` is `{ studentId, lessonId }`.
    - It does **not** check `require_submission`: the Admin decides.
- **Undo doesn't cascade.** Undoing lesson 5 leaves lesson 6's completion alone.
  - Today, 002's `computeLocks()` would lock lesson 6 again ("a locked chain stays locked"), and a done lesson the student couldn't open would be odd.
  - So `computeLocks()` gains one rule: **a done lesson is always open.** This matches 002's archived-course rule that completed lessons stay readable.
  - The spec's Edge Cases gets this line.
- **"Next lesson unlocks"** (US1 scenario 1) needs no extra code: locks are worked out on every read from the set of done lessons.
- **Rationale**: These are the smallest writes that fit the existing `(student_id, lesson_id)` primary key. Only `lesson_progress` decides progress (FR-004/005).
- **Alternatives**:
  - Delete the row on undo. Rejected: it would lose `in_progress`, and 008's idempotency key lives on the row.
  - Cascade undo to later lessons. Rejected: it destroys work the student did, and the spec doesn't ask for it.

## R2. Study minutes: focus sessions plus an estimate credited at completion

- **Decision**: All study time comes from two facts. Neither is ever recalculated after it's written.
  1. **Focus sessions** (`study_sessions`): the counted seconds are `least(coalesce(ended_at, now()), started_at + planned_minutes)` minus `started_at` (R3).
  2. **Completion credit** (`lesson_progress.minutes_spent`):
     - On completion, if the student has **no** focus session for that lesson, `minutes_spent = lessons.est_minutes`; otherwise 0 (FR-007, "when no timer was used").
     - Undo or reopen sets it back to 0.
     - The credit counts on the local date of `completed_at`.
     - An Admin's completion gets the same rule, because it records study the student did away from the app.
- A lesson's total minutes = `minutes_spent` + its sessions' minutes. US4 scenario 1 ("added to that lesson and the day") is met from the same rows.
- **Daily totals** come from one `$queryRaw` per student, in `progress/repo.ts` `dailyActivity(studentId, timeZone, from, to)`. It returns `{ date, seconds, completions }[]`:
  - days are grouped with `(ts at time zone $tz)::date`, which Postgres gets right across daylight-saving changes;
  - a session counts on the local date it **started**. The longest session is 25 min, so splitting one that crosses midnight isn't worth the code.
  - The admin cards use the same query for many students: it joins `profiles.timezone` and groups by student.
- `minutes_spent` gets this narrower meaning, "estimated minutes credited at completion without a timer". It is written into `docs/data-model.md` so nobody adds timer minutes to it (which would count them twice).
- **Rationale**:
  - One rule for the calendar, the streak, the weekly bars and the admin cards.
  - The credit is fixed when the lesson is completed, so a timer used on the lesson later doesn't change a past day, and can't break a past streak.
  - No migration is needed for the credit.
- **Alternatives**:
  - Recompute "no timer used" on every read. Rejected: a later session would rewrite history.
  - Insert a fake study session for the credit. Rejected: it mixes two meanings in one table and needs a `kind` column.
  - Store daily totals in a table. Rejected: there is too little data to need it, and it could go stale.

## R3. Focus timer: stamped on the server, capped in the database

- **Decision**:
  - A **migration** adds `study_sessions.planned_minutes smallint not null`, with `check (planned_minutes in (15, 25))` and `check (ended_at is null or ended_at <= started_at + planned_minutes * interval '1 minute')`. The cap from FR-007 is then a database rule, not only app code. The table is empty on dev (nothing seeds it), so adding a NOT NULL column without a default is safe; the migration checks this first.
  - A partial unique index, `study_sessions_one_running (student_id) where ended_at is null`, means one running session per student.
  - `startFocus({ lessonId, minutes: 15 | 25 })`:
    - Same guard as completing, but it also works after the lesson is done (re-studying).
    - In one transaction: close any open session at `least(now, started_at + planned)`, then insert a new one with `started_at = now()`. Server time, so a wrong phone clock can't inflate minutes.
    - Upsert `lesson_progress` to `in_progress` if it isn't done.
  - `stopFocus({ sessionId })` sets `ended_at = least(now(), started_at + planned)`. If less than 60 s were counted, the row is deleted instead: a mis-tap isn't study, and the existing `ended_at > started_at` check would reject a zero-length row.
  - **Reopening the app** needs no write. Every read uses the capped formula, so a session that ran out while the app was closed counts exactly `planned_minutes` (US4 scenario 2). The next `startFocus` or `stopFocus` closes it properly.
  - **Client**: `GET /api/focus` returns the open session (`startedAt`, `plannedMinutes`, `lessonId`) and the server's `now`. A `useCountdown` hook ticks once a second from those, adjusted for the clock difference, and calls `stopFocus` at zero.
    - No Zustand: the running timer is server state already held in the TanStack Query cache, so a store would be a second copy.
    - The lesson screen's bottom bar shows "Focus 15" with a "25 min" option. While a session runs it shows "mm:ss · Stop". If the session belongs to another lesson it shows "Focus running · {lesson}", which links there.
- **Rationale**:
  - Timestamps make the timer survive closing the app (US4 scenario 2).
  - The check constraint enforces the clarified cap even for writes that skip the app.
  - Server time avoids clock skew.
- **Alternatives**:
  - Store only `started_at` and a client-computed `ended_at`. Rejected: phone clocks drift and can be changed by the user.
  - A Zustand store with `persist`. Rejected: it duplicates server state and doesn't survive switching devices.
  - A pg_cron job to close expired sessions. Rejected: the capped read formula makes it unnecessary.

## R4. Streak, active days, weekly goal: pure functions over daily totals

- **Decision**: These live in `src/features/progress/streak.ts` and are unit-tested first, across time zones and daylight-saving dates.
  - `isActiveDay(day)`: `completions ≥ 1 || seconds ≥ 600` (FR-006).
  - `currentStreak(activeDates, today)`: the run of consecutive active local dates ending **today**. If today isn't active yet, the run ending **yesterday** counts, so a streak doesn't drop to 0 in the morning before the student studies.
  - `bestStreak(activeDates)`: the longest run ever. It reads the student's full history, but that is only a few hundred dates.
  - `weekActiveDays(activeDates, monday)`: active days Mon–Sun of the student's local week (003's `mondayOf`). It is shown as "{n} of {goal}" (FR-008), and n can go past the goal.
- "Today" is `todayIn(profile.timezone)` (003 `lib/time.ts`). A change of time zone only changes which dates future activity falls on (clarification 2026-11-22).
- **Weekly goal**: `setWeeklyGoal({ days: 1..7 })` in `features/profile/actions.ts`. It is reached from the Me screen's "Weekly goal · 5 days" row (`11-Profile.png`), which opens a sheet with 7 buttons. The column and its 1–7 check already exist.
- **Rationale**: These are display rules that aren't stored, so they go in tested TypeScript like 003's statuses (003 R1). The SQL only groups by day.
- **Alternatives**:
  - A recursive SQL query for runs. Rejected: harder to test, and it duplicates the "active day" rule.
  - A stored streak counter. Rejected: undo and time-zone changes would make it go stale.

## R5. Progress screen: Month and Week

- **Decision**: `GET /api/progress?view=month|week` serves `/s/progress` (`06-Progress.png`). Both views have:
  - the **streak** card ("6 · Day streak · Best: 9");
  - a **Studied** card: total time and active days in the period;
  - a **Lessons done** card: completions in the period, compared with the previous period ("+4 vs Oct"; for the week, "vs last week");
  - the **forecast** list (R6).
- **Month** (current local month) shows `CalendarMonth` (003, shared) with one shade per day and the "Weekly goal: n of goal days" label. Past days are filled, future days dashed, today outlined.
- **Week** (current local week) shows `WeekBars` in place of the calendar: 7 bars of minutes per day, with today emphasised.
  - The same component is the "Studied this week" card on the Courses tab (`05-Courses.png`), so it goes in `src/components/shared/week-bars.tsx`.
  - The Courses page gets the card from `progress/queries.ts` (`progressQuery('week')`), so a page composes both features.
- **Shades**: 5 levels from `heatLevel(seconds)`: 0; 1 s–14 min; 15–29; 30–59; 60+ min. The colours are tokens `--heat-1..4`, mixed from `--primary` and `--card` like 003's `--avail-*`, so all 10 themes get them. They use `color-mix(in srgb, …)` (18 %, 35 %, 60 %, then `--primary`), which the contrast test can compute: day numbers are `--foreground` on levels 1–3 and `--primary-foreground` on 4, at 4.5:1 or more in light and dark. Each day cell's name ends with the minutes (", 45 min studied") for screen readers.
- Only the current month and week are shown. The screenshot has no arrows to move between them, and the spec doesn't ask for it.
- **Rationale**: One endpoint and one query key serve the Progress screen and the Courses card.
- **Alternatives**: a separate endpoint for each card. Rejected: it adds requests for data that is computed the same way.

## R6. Finish forecast: the student's course deadline and a 14-day pace

- **Decision**: `forecast()` in `progress/forecast.ts` is pure and unit-tested. Inputs: published and done lesson counts (`course_progress`), lessons completed in this course in the last 14 local days, `today`, and the student's **course deadline** (`course_assignments.due_at`; 003 settled that the course target date only pre-fills it).
  - No published lessons → `empty`, shown as "—" (spec Edge Cases). `remaining = published − done`; 0 → `finished`.
  - `pace = doneLast14 / 14` lessons per day. 0 → `no_pace` ("No study in the last 2 weeks · {n} lessons left").
  - `finish = today + ceil(remaining / pace)` days.
  - With a deadline: `on_track` when `finish ≤` the deadline's local date ("On track · finishes ~24 Dec, due 31 Dec"); otherwise `behind` ("Behind · ~28 Jan at this pace, due 15 Jan").
  - Without one: `no_deadline` ("No deadline · ~6 lessons left").
- **Spec wording**: US3 scenario 2 says "a course with a target date". 003 decided the course target date only pre-fills each student's deadline, and 003's plan flagged this for 004. US3 scenario 2 now reads "a course deadline", and the plan records the change.
- **Rationale**: The student's own deadline is what the Today and Courses screens already show ("due 31 Dec"). A 14-day window evens out shift weeks.
- **Alternatives**:
  - Use `courses.target_date`. Rejected: it isn't the student's deadline, and it can differ from it.
  - Use the pace since the course started. Rejected: the spec says 14 days.

## R7. Submissions: lifecycle, autosave, images

- **Lifecycle** (`progress/submission-status.ts`, pure and tested; spec FR-004):

  | Who | From | To | Action |
  | --- | --- | --- | --- |
  | Student | (none), `draft`, `needs_redo` | same status | `saveDraft` (autosave) |
  | Student | (none), `draft`, `needs_redo` | `submitted` (`submitted_at = now`, `reviewed_at = null`) | `submitAssignment` |
  | Admin | `submitted`, `reviewed`, `needs_redo` | `reviewed` / `needs_redo` (`reviewed_at = now`) | `reviewSubmission` |

  - Anything else fails with `submission_locked` (student) or `invalid_transition` (admin).
  - The admin may change a review (Reviewed ↔ Needs redo) until the student resubmits (spec FR-004), but never sees or reviews a Draft.
  - The review never touches `lesson_progress` (clarification 2026-11-22).
- **Autosave**: the editor saves 1.5 s after typing stops, and again when the page is hidden (`visibilitychange`), through `saveDraft({ lessonId, bodyMd, attachments })`. It upserts on `(student_id, lesson_id)`.
  - The status line reads "Draft saved · 21:04" or "Saving…".
  - The editor keeps local state, so a refetch from Realtime or focus never overwrites text while the student types.
  - The screenshot's "3 of 5 written" is lesson-specific copy that can't be worked out generally, so it becomes "Draft saved · {time}". This difference is noted in contracts/ui-routes.md.
- **Guard**: `requireLessonReader` + `placeStudentLesson`, and the lesson must have an `assignment_prompt`, otherwise `not_found`. Archived courses are read-only: `course_not_active`.
- **Editor**: 002's `MdTextarea` (the `@uiw/react-md-editor` no-highlight build, with 44 px toolbar buttons) moves from `features/courses/components` to `src/components/shared/md-textarea.tsx`, because a second feature now uses it. The body uses the same byte limit as lesson content (`MAX_CONTENT_BYTES`, 200 KB, `content_too_long`); that constant and `utf8Bytes` move to `src/lib/content.ts`.
- **Images** (FR-003): up to 5 per submission.
  - The browser re-encodes each image with 002's resize code to at most 1600 px on the long edge, as WebP (or JPEG where WebP isn't supported), before upload. The resize helpers move from `features/courses/upload.ts` to `src/lib/image.ts` (second user).
  - The result must be ≤ 2 MB, otherwise `file_too_large`. At 1600 px this is far above typical sizes.
  - The client uploads straight to Storage (supabase-js is allowed for Storage, constitution VII) at `submissions/<studentId>/<lessonId>/<uuid>.<ext>`, the path 002's purge already expects. `saveDraft` then records `{ path, name, size }`.
  - The server rejects any path outside `<me>/<lessonId>/` (`invalid_input`) and more than 5 images (`too_many_images`).
  - Removing an image deletes the object and saves the draft.
  - The migration puts `file_size_limit = 2097152` and `allowed_mime_types = {image/webp, image/jpeg}` on the bucket, so Storage enforces the limit too.
- **Viewing images**: `GET /api/submissions/[submissionId]/files/[name]` checks access, then redirects to a 1-hour signed URL made with the **caller's** Supabase client, as 002's lesson files do.
  - Access: the student who owns it, or their linked Admin when the submission isn't a Draft.
  - Storage RLS mirrors this (R11).
- **Rationale**: This reuses the 002 upload path, which already works on iOS Safari. Storage limits back up the client checks. The transition table is the one rule shared by actions, guards and the RLS.
- **Alternatives**:
  - Upload through a Route Handler. Rejected: it doubles the traffic and hits Vercel's body limits.
  - A database trigger enforcing transitions. Rejected: the guards plus the tightened RLS (R11) already enforce it in both layers, and a trigger would be a third copy.

## R8. Comments: a Notes thread per lesson, review comments per submission

- **Decision**: The `comments` table already has `student_id` ("whose thread"), `target_type` and `target_id`.
  - **Notes** (FR-010): `target_type = 'lesson'`, `target_id = lessonId`, `student_id` = the student.
    - Either side can post with `postNote({ lessonId, studentId?, body })`. A student omits `studentId` (it's taken from the session); an Admin gives it.
    - Guards: a student needs `requireLessonReader` (locks don't matter; talking about a locked lesson is fine). An admin needs `requireAdminLessonTarget`.
  - **Review comments**: `target_type = 'submission'`, `target_id = submissionId`. They are written only by `reviewSubmission` (an optional comment, 1–2000 characters) and shown on the Assignment tab under the submission. The student replies in Notes.
  - Comments can't be edited or deleted in 004, so there are no UPDATE or DELETE policies. The body must be 1–2000 characters (the existing check). Threads are oldest first. The tab label shows the count: "Notes · 1".
  - **Purge**: `target_id` has no foreign key, so 002's lesson purge (`features/courses/purge.ts`) also deletes the comments that target the purged lesson or its submissions.
- **Rationale**: The table needs no changes. Keeping review comments on the submission keeps the Notes conversation separate (clarification 2026-11-22).
- **Alternatives**:
  - Let students post on the submission thread too. Rejected: there would be two places to talk about one lesson.
  - Editable comments. Rejected: the spec doesn't ask for it.

## R9. Notices for 006

- **Decision**: Use 003's `recordNotice()` (`src/server/notifications/record.ts`) without changes. One row per recipient and submission (spec FR-009):

  | Event | Recipient | `source_id` | `occurrence_key` | url |
  | --- | --- | --- | --- | --- |
  | Submitted or resubmitted | each actively linked Admin of the student | submission id | `submitted` | `/a/students/<studentId>/lessons/<lessonId>` |
  | Reviewed or Needs redo | the student | submission id | `reviewed` | `/s/lessons/<lessonId>?tab=assignment` |

  - Text is in the **recipient's** locale.
  - 003's `textsFor(student)` (in `features/assignments/notices.ts`) becomes `textsFor(recipient)` in `src/server/notifications/texts.ts`, because a second feature uses it. 003's notice builders stay where they are and import it.
  - Notes posts record no notice: the spec doesn't ask for one. 006 can add it.
- **Rationale**: This follows 003 FR-012 and R8 exactly. The submission id is unique per student and lesson, which gives "one notice per student and lesson".
- **Alternatives**: use the lesson id as `source_id`. Rejected: the submission id is just as unique and it links to the thing that changed.

## R10. Realtime: live screens without push

- **Decision**:
  - The migration adds `submissions`, `comments` and `lesson_progress` to the `supabase_realtime` publication. Realtime applies each subscriber's SELECT policies, so an Admin only gets their linked students' non-Draft submissions (`subs_admin_read`).
  - A hook, `useRealtimeInvalidate({ table, filter?, queryKeys, when? })` in `src/lib/realtime.ts` (named in tech spec §7), subscribes with the browser client and invalidates the given TanStack Query keys on a change. It unsubscribes on unmount.
    - It calls `supabase.realtime.setAuth()` before subscribing (found during US2). A channel that joins before the session is read stays anonymous, and RLS then hides every change.
    - Events within 150 ms are grouped across all subscriptions, so one write (a review updates the submission and adds a comment) refetches each key once.
    - `when` skips events that can't change the screen: the student's own saves and submits, other lessons, and redo edits on the Admin side. Each refetch of the lesson work costs a round of queries.

  | Screen | Subscribes to | Invalidates |
  | --- | --- | --- |
  | `/a/students` | `submissions`, `lesson_progress` (RLS limits rows to linked students) | `['admin','students','progress']` |
  | `/a/students/[studentId]/lessons/[lessonId]` | `submissions` + `comments` with `student_id=eq.<id>` | that lesson's admin key |
  | `/s/lessons/[lessonId]` | `submissions` + `comments` with `student_id=eq.<me>` | `['lesson',id,'work']`, `['lesson',id,'notes']` |

  - The student's own autosaves also send events on their channel. `when` ignores them, and a refetch never replaces the editor's local text (R7).
- SC-002 (an Admin with the Students screen open sees a new submission within 5 seconds) is met by Realtime plus one refetch. The Playwright test checks it with a 5 s timeout and no reload.
- **Rationale**: The constitution names Realtime for this, and supabase-js is allowed for Realtime. Invalidating instead of patching the cache keeps one code path for reads.
- **Alternatives**:
  - Poll every 5 s. Rejected: wasted requests on a phone.
  - Broadcast channels from Server Actions. Rejected: they need the service role in actions and skip RLS.

## R11. Access rules: make the two layers agree

The 0_init policies are looser than the guards. Following 003 R12, the migration replaces them with hand-written ones (never a Prisma drop), and pgTAP covers the old allowed cases and the new denied ones.

| Table | 0_init | 004 |
| --- | --- | --- |
| `lesson_progress` | `progress_student` FOR ALL own rows; admin UPDATE only | Student: SELECT, INSERT, UPDATE own rows, `completed_by` null or self, lesson readable (`can_read_lesson`). Admin: SELECT linked; INSERT and UPDATE with `is_admin_of(student_id)`, `completed_by` = self, lesson in a course they own. No DELETE. |
| `submissions` | `subs_student` FOR ALL; admin UPDATE any status | Student: SELECT own; INSERT with status `draft`/`submitted`; UPDATE only while the old row is `draft`/`needs_redo`, new status `draft`/`submitted`, `reviewed_at` unchanged (null on submit). Admin: SELECT non-Draft (unchanged); UPDATE when the old row isn't `draft` and the new status is `reviewed`/`needs_redo`. No DELETE. |
| `comments` | INSERT if author = self and own or linked thread | Plus the target must belong to the thread. A lesson target needs, for a student author, `student_id = auth.uid()` and `can_read_lesson(target_id)` (the same rule as `requireLessonReader`, personal courses included); for an Admin author, `is_admin_of(student_id)` and a Published, non-deleted lesson in a course they own with an active assignment for `student_id` (the same rule as `requireAdminLessonTarget`). A submission target needs an Admin author, a submission of that `student_id` and a non-Draft status. |
| `study_sessions` | `sessions_student` FOR ALL | Unchanged; the new checks (R3) enforce the cap. |
| `storage.objects` (`submissions`) | raw `::uuid` casts; admin reads any file of a linked student | `uuid_folder()` (002's safe cast). Student: read and write their own folder. Admin: read only when a non-Draft submission of `(folder 1 student, folder 2 lesson)` exists. |

- **Guards**:
  - 003's `requireLessonDeadlineTarget(lessonId, studentId)` already checks exactly what the Admin's lesson actions need: own course, lesson Published and not deleted, student linked, active assignment.
  - It is **renamed** `requireAdminLessonTarget` in one mechanical change (12 references in `assignments/actions.ts`, `assignments/repo.ts`, `guards.ts` and `guards.test.ts`), so the name says what it guards.
  - The RLS conditions above mirror it.
- **Rationale**: Constitution I says both layers apply the same rules. With 0_init's `subs_student` FOR ALL, a student with a token could mark their own work Reviewed.
- **Alternatives**: rely on the guards only. Rejected for the same reason as in 003 R12.

## R12. Admin screens

- **Decision**:
  - **`/a/students`** (`16-AdminStudents.png`): below 001's invite card and join requests, one card per linked student, from `GET /api/admin/students/progress`. Each card shows:
    - the avatar, name and the red "{n} overdue" chip (003's overdue rules, through a new `countOverdue(studentIds, now)` in `assignments/student-repo.ts`);
    - three tiles: streak, "This week" (time), "Lessons done" (this local week, the same number as the Courses card);
    - one progress bar per active course (`course_progress`, coloured with the course accent from 002);
    - a "{n} to review" link when there are submissions waiting.

    The whole card links to the student's screen. All data comes from a fixed number of queries for all students (R2), with no N+1.

    Left out because other features own them: "Night shift tonight" (005), "active 2 h ago" (not in the spec), "Send a nudge" and "Reminders" (006).
  - **`/a/students/[studentId]`** (new; there's no screenshot, so it reuses the 002 course-screen layout):
    - "To review" first: submitted items, oldest first.
    - Then each active course with its lesson rows: number, title, done check, submission chip (Submitted / Reviewed / Needs redo).
  - **`/a/students/[studentId]/lessons/[lessonId]`** (new):
    - Header "{student} · {course} · Lesson n".
    - Tabs **Assignment** (the submission rendered with images, review comments, a comment box, and the buttons **Reviewed** and **Needs redo**) and **Notes · n** (the thread and a reply box).
    - A bottom bar with **Mark done** / **Reopen**, which shows "Done · {date} by {name}" when it is done.
- **Rationale**: FR-002 and US2 scenario 3 need somewhere to act, and the spec has no screenshot for it. Reusing existing layouts keeps the work small.
- **Alternatives**: reviewing inside the Students card. Rejected: too cramped at 390 px.

## R13. Student screens: new progress endpoints, small additions to old ones

The rule: data about the student's **work** comes from new `progress` endpoints, and course data stays in the 002/003 endpoints. That way `features/courses` and `features/assignments` don't read progress internals; each page composes the queries it needs.

- **`GET /api/lessons/[lessonId]/work`** (new, student) returns:
  - `progress: { done, completedAt, completedByName | null, minutes }`;
  - `submission: { id, status, bodyMd, attachments, submittedAt, reviewedAt } | null`;
  - `reviewComments`;
  - `notesCount`;
  - `nextLessonId` (for "Next lesson" after completing).

  The lesson page prefetches it alongside 002's `GET /api/lessons/[lessonId]`. The notes thread has its own endpoint (contracts).
- **Lesson screen** (`10-Lesson.png`):
  - Tabs **Lesson / Assignment / Notes · n**. Assignment only shows when the lesson has an assignment prompt; `?tab=` is kept in the URL.
  - The Lesson tab keeps 002's content and adds the assignment summary card: "Assignment: {first line of the prompt}" with "Draft saved" / "Submitted" / "Needs redo" / "Reviewed".
  - Bottom bar: **Focus 15** (R3) and **Mark complete**. When done it shows "Done ✓ · Undo" and a "Next lesson" link.
- **Today**: the page adds `GET /api/progress/summary` (new) next to 003's `GET /api/today`. It returns:
  - `streak: { current, best }` and `week: { activeDays, goal }` for the two cards;
  - `continue`: the active course with the latest activity (a completion or a session), its first open lesson that isn't done, and `{ done, total }`. If nothing has been studied yet, it's the first assigned course. It is null when everything is done.
- **Courses** (`GET /api/courses`, 002/003): each active card gains `percent` (null = "—") and `doneCount` from the `course_progress` view (course data, which 002's admin repo already reads), for the bar and "12 of 20". The page adds the `WeekBars` "Studied this week · {time} · {n} lessons done" card from the progress query (R5).
  - Left out: the Completed and Mine chips and the + button. The spec doesn't cover them, and the personal-courses feature owns Mine and +.
- **Course screen** (`GET /api/courses/[courseId]`): `course.progress: { percent, done, total }` for the progress card.
- **Rationale**: The old endpoints only gain fields, so 002 and 003 contracts and tests stay valid (as in 003 R11). The progress data has one owner.

## R14. Speed: optimistic updates and query keys (SC-001)

- `completeLesson`, `undoCompletion` and `setLessonDone` update the lesson cache optimistically in `onMutate`, with rollback in `onError`.
- On success they invalidate `['today']`, `['courses','student']` (prefix), `['progress']` (prefix) and, for admins, `['admin','students']`.
- The lesson screen changes before the server answers. The other screens refetch in the background and are fresh when opened, so SC-001's 1 s budget is met.
- `startFocus` and `stopFocus` update `['focus']` optimistically. The countdown starts from the client's clock and is corrected when the server's `startedAt` arrives.

## R15. Offline is 008

- The Edge Case "offline completion is queued and synced" belongs to 008 (Serwist and Dexie are not installed).
- 004 actions fail with the existing `offline` error code when there's no network.
- The `client_op_id` columns stay unused until 008. Adding an idempotency key now would be speculative (CLAUDE.md, KISS/YAGNI).

## R16. Dependencies

None added. 004 uses packages the project already has:
- `@uiw/react-md-editor` 4.2.4 (moved to shared);
- `@supabase/supabase-js` 2.119 (Storage, Realtime);
- `date-fns` and `@date-fns/tz` (003);
- shadcn `sheet` and `dropdown-menu`, plus shadcn `tabs` generated with the shadcn CLI. It needs no new package, because `radix-ui` 1.8 is already installed. The lesson tabs need real tab semantics; the shared `Segmented` radio group stays for the Week/Month toggle.

Zustand (R3) and Dexie (R15) aren't needed.

## R17. Tests

- **pgTAP** `supabase/tests/004_progress_policies.test.sql`:
  - each table in R11 for student, own admin, other admin and unlinked user, allowed and denied;
  - the transition rules (a student can't set `reviewed`; an admin can't touch a Draft);
  - the comment target checks;
  - the `study_sessions` cap and the one-running index;
  - Storage reads of a Draft's files;
  - `course_progress` with 0 published lessons gives no row or null.
- **Vitest (unit, written first)**:
  - `progress/streak.test.ts`: runs, yesterday's grace, best, week count; Tokyo, Yangon, New York and a daylight-saving week.
  - `progress/forecast.test.ts`: all six outcomes and rounding.
  - `progress/focus.test.ts`: the capped seconds, the 60 s discard.
  - `progress/submission-status.test.ts`: the R7 table.
  - `progress/completion.test.ts`: the R1 blocks.
  - `progress/heat.test.ts`.
  - `courses/lock.test.ts`: plus "a done lesson is always open".
  - `progress/schemas.test.ts`.
- **Vitest (dev DB)**:
  - guards: `requireAdminLessonTarget` keeps 003's cases;
  - `progress/repo.test.ts`: daily grouping by local date incl. daylight-saving, completion credit only without a timer, undo clears the credit, admin completion is audited, a review leaves progress alone, notices replace earlier ones;
  - purge removes comments.
- **Playwright** at 390×844 and 1280×800 with axe:
  - `us1-complete` (mark, require-submission redirect, undo, admin mark/reopen with audit);
  - `us2-submit` (autosave, images, submit → admin sees it live within 5 s, review → student sees it live, redo → resubmit, Notes both ways);
  - `us3-progress` (seeded history: streak, calendar, forecast, admin card);
  - `us4-focus` (start, stop, a seeded expired session counts 15 min).
  - Fixtures gain `seedSession` and `seedComment`. They keep `markDone` and `seedSubmission`.

## Sources
- `.specify/memory/constitution.md` 2.0.1; `docs/technical-spec.md` §3, §7 (optimistic updates, Realtime), §13 (offline); `docs/data-model.md` §3–§7.
- `prisma/migrations/0_init/migration.sql` L140–183 (tables), L406–419 (`course_progress`), L554–564 (policies), L589–605 (Storage); `20261121124949_courses_lessons` (`can_read_lesson`, `uuid_folder`, the `lesson-files` limits).
- `specs/002-courses-lessons/research.md` R1 (locks), R3 (signed URLs), R6 (Markdown editor); `specs/003-assign-deadlines/research.md` R1, R3, R8, R11, R12 and plan.md (the forecast note).
