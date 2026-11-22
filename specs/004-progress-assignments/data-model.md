# Data Model: Completion, Assignments and Progress (004)

The tables, the `course_progress` view and the `submissions` bucket already exist in `0_init` (docs/data-model.md §3). 004 adds:
- one column and two checks on `study_sessions`;
- three indexes;
- tightened policies;
- bucket limits;
- three tables in the Realtime publication.

It also defines the rules the app applies. Field names are the database names; Prisma uses camelCase.

## Entities

### LessonProgress (`lesson_progress`)

| Field | Type | Rules |
| --- | --- | --- |
| `student_id`, `lesson_id` | uuid PK | the lesson is readable by the student (`can_read_lesson`) |
| `status` | `not_started` / `in_progress` / `done` | `in_progress` after a focus session; `done` by completion (R1) |
| `completed_at` | timestamptz, null | set when `done`, null otherwise |
| `completed_by` | uuid → profiles, null | the student, or the linked Admin who marked it (FR-002); set by the server |
| `minutes_spent` | int ≥ 0 | **only** the estimate credited at completion when the lesson has no focus session (= `lessons.est_minutes`), else 0; reset by undo or reopen (research R2) |
| `client_op_id` | uuid, null, unique | unused until 008 |
| `updated_at` | timestamptz | set by the actions |

**New index** (Prisma `@@index([studentId, completedAt], map: "lesson_progress_student_completed")`): daily and monthly completion counts.

### Submission (`submissions`)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id`, `lesson_id` | uuid | unique pair; the lesson has an `assignment_prompt` |
| `body_md` | text | ≤ `MAX_CONTENT_BYTES` (200 KB) |
| `attachments` | jsonb `[{ path, name, size }]` | 0–5 items; `path` under `<student_id>/<lesson_id>/`; `size` ≤ 2 097 152 |
| `status` | `draft` / `submitted` / `reviewed` / `needs_redo` | transitions below |
| `submitted_at` | timestamptz, null | set on every submit |
| `reviewed_at` | timestamptz, null | set on review; cleared on resubmit |
| `updated_at` | timestamptz | |

### Comment (`comments`)

| Field | Type | Rules |
| --- | --- | --- |
| `author_id` | uuid | the caller (server-set) |
| `student_id` | uuid | whose thread; the author is this student or their linked Admin |
| `target_type`, `target_id` | `lesson` + lesson id (Notes) / `submission` + submission id (review) | Notes: a lesson the student can read (`can_read_lesson`, personal courses included) or, for an Admin author, a lesson that passes `requireAdminLessonTarget`. Review comments: Admin author, non-Draft submission of `student_id` |
| `body` | text 1–2000 | existing check |
| `created_at` | timestamptz | threads are ordered oldest first |

Comments can't be edited or deleted (research R8).

**New index** (`@@index([studentId, targetType, targetId, createdAt], map: "comments_thread")`): loads a thread and counts its comments.

### StudySession (`study_sessions`)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid | |
| `lesson_id` | uuid, null | set when started; becomes null if the lesson is purged |
| `started_at` | timestamptz | server `now()` (research R3) |
| `ended_at` | timestamptz, null | null = running; `> started_at` (existing check) and `≤ started_at + planned_minutes` (**new** check) |
| `planned_minutes` | smallint, **new** | `in (15, 25)` |
| `client_op_id` | uuid, null, unique | unused until 008 |

**New index** (`@@index([studentId, startedAt], map: "study_sessions_student_started")`) and a partial unique index `study_sessions_one_running (student_id) where ended_at is null` (SQL).

### Used from other features

| Entity | Fields used | Change in 004 |
| --- | --- | --- |
| **Profile** (001) | `timezone`, `locale`, `display_name`, `weekly_goal_days` | the student sets `weekly_goal_days` (FR-008) |
| **Lesson** (002) | `est_minutes`, `assignment_prompt`, `require_submission`, `status`, `deleted_at`, `unlock_rule` | none; `computeLocks()` adds "done is always open" (research R1) |
| **Course** (002) | `status`, `title`, accent | none |
| **CourseAssignment** (003) | `status`, `due_at` | read (forecast deadline) |
| **Notification** (006) | | upserts (below) |
| **AuditLog** | | inserts for the Admin's mark done and reopen |

## Derived values (never stored)

| Value | Rule | Where |
| --- | --- | --- |
| Counted session seconds | `least(coalesce(ended_at, now), started_at + planned_minutes) − started_at` | SQL in `progress/repo.ts`; `countedSeconds()` in `progress/focus.ts` |
| Day of an activity | `(started_at or completed_at at time zone <student tz>)::date` | `dailyActivity()` |
| Daily study seconds | Σ counted session seconds + Σ `minutes_spent × 60` of completions on that day | `dailyActivity()` |
| Active day | ≥ 1 completion or ≥ 600 study seconds (FR-006) | `isActiveDay()` |
| Current streak | consecutive active days ending today, or yesterday if today isn't active yet | `currentStreak()` |
| Best streak | longest run of active days | `bestStreak()` |
| Weekly goal progress | active days Mon–Sun (local) "of" `weekly_goal_days` | `weekActiveDays()` |
| Course progress | `course_progress.percent`; null (no row or 0 published lessons) → "—" (FR-005) | view |
| Forecast | research R6: `empty` / `finished` / `no_pace` / `on_track` / `behind` / `no_deadline` | `forecast()` |
| Heat level | 0; < 15 min; < 30; < 60; ≥ 60 | `heatLevel()` |
| Lesson total minutes | `minutes_spent` + its sessions' counted minutes | lesson endpoint |

## Lifecycles

### Lesson progress

```text
(no row) ─focus start─► in_progress ─complete─► done ─undo / reopen─► in_progress (has a session)
    │                                             ▲                └─► not_started (no session)
    └──────────────complete───────────────────────┘
```

- Complete is blocked by: a locked lesson (`lesson_locked`), a course that isn't Active (`course_not_active`), or `require_submission` without a non-Draft submission (`submission_required`, students only).
- Completing an already-done lesson changes nothing.
- An Admin's complete or reopen writes `audit_log` `{ action: 'lesson.complete' | 'lesson.reopen', target: { studentId, lessonId } }`.

### Submission (spec FR-004)

```text
(none) ─save─► draft ─submit─► submitted ─review─► reviewed
                 ▲ save          │      ▲               │ ▲
                 └──┘            │      └───resubmit──┐  ▼ │ (admin may change the review)
                                 └──────review──────► needs_redo ◄─ save (student edits)
```

| Who | Allowed from | To |
| --- | --- | --- |
| Student `saveDraft` | none, `draft`, `needs_redo` | unchanged (`draft` when new) |
| Student `submitAssignment` | none, `draft`, `needs_redo` | `submitted` |
| Admin `reviewSubmission` | `submitted`, `reviewed`, `needs_redo` | `reviewed`, `needs_redo` |

A review never changes `lesson_progress`.

### Study session

```text
start ─► running (ended_at null) ─stop / timer end─► ended (≤ planned)
                 │
                 └─ app closed past planned end ─► counts as planned; closed at start + planned on the next start or stop
stop with < 60 s counted → row deleted
```

## Notifications recorded by 004 (spec FR-009; research R9)

| Event | Recipient | `source_type` | `source_id` | `occurrence_key` | url |
| --- | --- | --- | --- | --- | --- |
| Submit or resubmit | each actively linked Admin | `system` | submission id | `submitted` | `/a/students/<studentId>/lessons/<lessonId>` |
| Reviewed or Needs redo | the student | `system` | submission id | `reviewed` | `/s/lessons/<lessonId>?tab=assignment` |

The upsert uses the existing unique key, as in 003. A newer notice replaces the earlier one and is unread again. Text is in the recipient's locale.

## Migration `<UTC timestamp>_progress`

Generated per docs/data-model.md §7 (diff the committed `schema.prisma` against the edited one), then completed by hand.

**Prisma diff** (from the schema edits above):
- `ALTER TABLE "study_sessions" ADD COLUMN "planned_minutes" SMALLINT NOT NULL;`. First check that `select count(*) from study_sessions` is 0 on dev (nothing seeds it).
- `CREATE INDEX "lesson_progress_student_completed" …`, `"comments_thread"`, `"study_sessions_student_started"`.

**Added by hand**:
1. Checks: `study_sessions_planned (planned_minutes in (15, 25))`, `study_sessions_capped (ended_at is null or ended_at <= started_at + planned_minutes * interval '1 minute')`.
2. `create unique index study_sessions_one_running on study_sessions (student_id) where ended_at is null;`
3. Replace the policies (deliberate, hand-written; not a Prisma drop). Research R11 has the full rules.
   - `progress_student` → `progress_student_read`, `progress_student_insert`, `progress_student_update`.
   - `progress_admin_write` → `progress_admin_insert`, `progress_admin_update`. `progress_admin_read` stays.
   - `subs_student` → `subs_student_read`, `subs_student_insert`, `subs_student_update`.
   - `subs_admin_review`: replaced with the transition check. `subs_admin_read` stays.
   - `comments_write`: replaced, adding the target checks.
   - Storage `submission_files_rw`, `submission_files_admin_read`: replaced with `uuid_folder()` versions, and the admin read requires a non-Draft submission.
4. Bucket limits: `update storage.buckets set file_size_limit = 2097152, allowed_mime_types = '{image/webp,image/jpeg}' where id = 'submissions';`
5. `alter publication supabase_realtime add table public.submissions, public.comments, public.lesson_progress;`

`docs/data-model.md` is updated in the same change:
- the `minutes_spent` meaning;
- `planned_minutes`;
- the new indexes and checks;
- §4: replaced policies and bucket limits;
- §5: the renamed guard;
- §6: Realtime tables.

## Guards (mirror the SQL)

| Guard | Allows | Mirrors |
| --- | --- | --- |
| `requireLessonReader(lessonId)` (002) + `placeStudentLesson` (002, lock check) | a student who can read and open the lesson | `can_read_lesson`, `progress_student_*`, `comments_write` (student, lesson target) |
| `requireAdminLessonTarget(lessonId, studentId)` (**renamed** from 003's `requireLessonDeadlineTarget`) | owner of the lesson's course, lesson Published and not deleted, student linked, active assignment | `deadlines_write`, `progress_admin_*`, `comments_write` (lesson) |
| `requireSubmissionReviewer(submissionId)` (**new**) | linked Admin of the submission's student; the submission isn't Draft; the lesson is in a course the Admin owns. Returns `{ me, submission }` | `subs_admin_review` |
| `requireAdminOf(studentId)` (001) | admin actively linked to the student | `is_admin_of` |
| `requireRole('student')` | the student's own focus sessions, weekly goal, progress | `sessions_student`, `profiles` self |

Each action takes the student id from the guard or from the session, never from client input. The one exception is the Admin's `studentId`, which the guard checks.
