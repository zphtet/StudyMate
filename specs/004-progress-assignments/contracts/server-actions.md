# Contract: Server Actions (writes) — 004

Every action is wrapped in `action()` (`src/lib/action.ts`): Zod parse, then guard, then repo, returning `Result<T>`. Clients call them from `useMutation` and `unwrap()`. Error codes are snake_case with an `errors.*` key in all 3 message files.

Files:
- `src/features/progress/actions.ts`; schemas in `src/features/progress/schemas.ts`, shared with the forms;
- `setWeeklyGoal` goes in `src/features/profile/actions.ts`.

## Field schemas

```ts
const uuid = z.uuid()
const attachment = z.object({ path: z.string().max(300), name: z.string().trim().min(1).max(200), size: z.number().int().min(1).max(2_097_152, { error: 'file_too_large' }) })
const attachments = z.array(attachment).max(5, { error: 'too_many_images' })
const bodyMd = z.string().refine((v) => utf8Bytes(v) <= MAX_CONTENT_BYTES, { error: 'content_too_long' })
const commentBody = z.string().trim().min(1, { error: 'commentRequired' }).max(2000, { error: 'commentTooLong' })
```
The server also checks that every `path` starts with `<me.id>/<lessonId>/` (`invalid_input`).

## Completion (research R1)

### `completeLesson({ lessonId })`
→ `Result<{ completedAt: string; nextLessonId: string | null }>`
- Guards: `requireRole('student')`, `requireLessonReader`, `placeStudentLesson`.
- Fails:
  - `lesson_locked` (403);
  - `course_not_active` (Archived course);
  - `submission_required` when `require_submission` is on and there is no non-Draft submission.
- Upserts `lesson_progress` done, `completed_by = me`, with the `minutes_spent` credit (research R2). If the lesson is already done, it returns the existing row unchanged.

### `undoCompletion({ lessonId })`
→ `Result<{ status: 'in_progress' | 'not_started' }>`
- Same guards. Fails `course_not_active`. Does nothing if the lesson isn't done.

### `setLessonDone({ studentId, lessonId, done })` (Admin, FR-002)
→ `Result<{ done: boolean }>`
- Guard: `requireAdminLessonTarget(lessonId, studentId)`. Fails `course_not_active`.
- Applies the same row changes as above, with `completed_by` = the admin, plus an `audit_log` insert in the same transaction. Nothing is written when the value is already what was asked.

## Submissions (research R7)

### `saveDraft({ lessonId, bodyMd, attachments })`
→ `Result<{ submissionId: string; status: 'draft' | 'needs_redo'; updatedAt: string }>`
- Guards: as for `completeLesson`. The lesson must have an `assignment_prompt` (`not_found`).
- Fails:
  - `submission_locked` when the status is `submitted` or `reviewed`;
  - `course_not_active`.
- Upserts on `(student_id, lesson_id)`. A new row is `draft`; the status otherwise stays as it was.

### `submitAssignment({ lessonId, bodyMd, attachments })`
→ `Result<{ submissionId: string; submittedAt: string }>`
- Same guards and failures. Also fails `submission_empty` when the body is blank and there are no images.
- Sets `submitted`, `submitted_at = now`, `reviewed_at = null`. Records a `submitted` notice for each linked Admin (research R9).

### `reviewSubmission({ submissionId, status, comment? })`
```ts
input = { submissionId: uuid; status: 'reviewed' | 'needs_redo'; comment?: commentBody }
→ Result<{ status: 'reviewed' | 'needs_redo'; reviewedAt: string }>
```
- Guard: `requireSubmissionReviewer(submissionId)`. A Draft gives 404 `submission_not_found`.
- In one transaction:
  - set the status and `reviewed_at = now`;
  - insert the comment (`target_type 'submission'`) when one is given;
  - record a `reviewed` notice for the student.
- `lesson_progress` is never touched.

### Removing an image
The client deletes the Storage object (supabase-js, research R7), then calls `saveDraft` without it. There's no separate action.

## Notes (research R8)

### `postNote({ lessonId, studentId?, body })`
→ `Result<{ comment: Comment }>`
- **Student**: `requireRole('student')` + `requireLessonReader(lessonId)`. `studentId` must be omitted or equal `me.id` (`forbidden`).
- **Admin**: `requireAdminLessonTarget(lessonId, studentId)`. `studentId` is required (`invalid_input`).
- Inserts `comments` with `target_type 'lesson'`, `author_id = me`. No notice.

## Focus timer (research R3)

### `startFocus({ lessonId, minutes })`
```ts
input = { lessonId: uuid; minutes: 15 | 25 }
→ Result<{ sessionId: string; startedAt: string; plannedMinutes: 15 | 25 }>
```
- Guards: `requireRole('student')`, `requireLessonReader`, `placeStudentLesson`. Fails `course_not_active`.
- One transaction:
  - close any open session at `least(now, started_at + planned)`;
  - insert the new session with `started_at = now()`;
  - set `lesson_progress` to `in_progress` unless it is done.

### `stopFocus({ sessionId })`
→ `Result<{ countedSeconds: number }>`
- Guard: `requireRole('student')`. The session must be the caller's (`session_not_found`).
- Sets `ended_at = least(now, started_at + planned)`. If less than 60 s was counted, it deletes the row and returns 0. Stopping a session that is already closed returns its counted seconds.

## Weekly goal (FR-008)

### `setWeeklyGoal({ days })` (`features/profile/actions.ts`)
```ts
input = { days: z.number().int().min(1).max(7) }
→ Result<{ days: number }>
```
- Guard: `requireRole('student')`. Updates the caller's `profiles.weekly_goal_days`.

## Renamed guard

`requireLessonDeadlineTarget` becomes `requireAdminLessonTarget` (research R11). 003's `setLessonDeadline` keeps its behaviour and error codes.

## Error codes (new)

| Code | When |
| --- | --- |
| `submission_required` | completing a lesson with "submit before complete" and no non-Draft submission |
| `submission_locked` | the student edits or submits while the status is `submitted` or `reviewed` |
| `submission_empty` | submitting with no text and no images |
| `submission_not_found` | missing, a Draft (for Admins), or not the reviewer's student |
| `invalid_transition` | a review status that the transition table doesn't allow |
| `too_many_images` | more than 5 attachments |
| `session_not_found` | stopping a focus session that isn't the caller's |

Existing codes reused: `lesson_locked`, `lesson_not_found`, `course_not_active`, `assignment_not_found`, `forbidden`, `invalid_input`, `content_too_long`, `file_too_large`, `file_type_not_allowed`, `offline`.

New validation keys: `validation.commentRequired`, `validation.commentTooLong`.

## Query invalidation after success

| Action | Optimistic | Invalidate |
| --- | --- | --- |
| `completeLesson`, `undoCompletion` | `['lesson',id,'work']` progress | `['today']`, `['progress']` (prefix), `['courses','student']` (prefix) |
| `setLessonDone` | admin lesson key | `['admin','students']` (prefix) |
| `saveDraft` | none (the editor holds the text) | none: the result updates `['lesson',id,'work']` (card status and time) |
| `submitAssignment` | none: a spinner, then the result sets `['lesson',id,'work']` to `submitted` | `['lesson',id,'work']` |
| `reviewSubmission` | admin lesson key status | `['admin','students']` (prefix) |
| `postNote` | appends to the thread | `['lesson',id,'notes',studentId]`, the work or admin lesson key (count) |
| `startFocus`, `stopFocus` | `['focus']` | `['progress']` (prefix), `['lesson',id,'work']` |
| `setWeeklyGoal` | `['me']` | `['progress']` (prefix) |

Realtime (research R10) invalidates the same keys when the other side writes.

`submitAssignment` is not optimistic: switching to the read-only view before the server answers would unmount the editor, and a refused submit (`submission_empty`, `submission_locked`) would then lose unsaved text.

## Notes
- No action accepts `completedBy`, `authorId`, `status` for students, `startedAt`, `endedAt` or `reviewedAt` from the client; the server derives them.
- Student actions never accept a `studentId` other than their own.
