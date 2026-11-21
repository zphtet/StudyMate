# Contract: Server Actions (writes) — 003

Every action is wrapped in `action()` (`src/lib/action.ts`): Zod parse → guard → repo, returning `Result<T>`. Clients call them from `useMutation` and `unwrap()`. Error codes are snake_case with an `errors.*` key in all 3 message files.

File: `src/features/assignments/actions.ts`. Schemas: `src/features/assignments/schemas.ts` (shared with the forms).

## Field schemas

```ts
const dueAt = z.iso.datetime({ offset: true }).nullable() // instant; null = no deadline
const uuid = z.uuid()
```

## `saveAssignments(input)`

```ts
input = {
  courseId: uuid
  rows: { studentId: uuid; assigned: boolean; dueAt: dueAt }[] // 1..200, unique studentIds
  unlockInOrder: boolean
  addDefaultReminders: boolean
  notifyNow: boolean
}
→ Result<{ assigned: number; unassigned: number; updated: number }>
```
- Guards: `requireCourseOwner(courseId)`, then `requireAdminOfAll(rows.map(r => r.studentId))`.
- Fails `course_not_active` when the course is Draft, Archived or deleted.
- One transaction (research R5): upsert ticked rows; set previously active, now unticked rows to `removed`; `applyUnlockInOrder` when changed; default reminders for ticked students when `addDefaultReminders` (research R9); notices: `assigned` for new or reassigned students when `notifyNow`, `deadline` for already assigned students whose `dueAt` changed (research R8).
- Rows for unlinked students fail the whole call with `forbidden`.

## `setCourseDeadline(input)`

```ts
input = { courseId: uuid; studentId: uuid; dueAt: dueAt }
→ Result<{ dueAt: string | null }>
```
- Guard: `requireAssignmentOwner(courseId, studentId)` → 404 `assignment_not_found` when missing or `removed`.
- Fails `course_not_active` when the course isn't Active.
- Records a `deadline` notice when the value changed.

## `setLessonDeadline(input)`

```ts
input = { lessonId: uuid; studentId: uuid; dueAt: dueAt } // null removes the lesson's own deadline
→ Result<{ dueAt: string | null; effectiveDueAt: string | null }>
```
- Guard: `requireLessonDeadlineTarget(lessonId, studentId)` → 404 `lesson_not_found` or `assignment_not_found`.
- Upsert or delete `lesson_deadlines` (`set_by` = me). Records a `deadline` notice when the effective deadline changed.

## Error codes (new)

| Code | When |
| --- | --- |
| `course_not_active` | assigning or editing deadlines on a non-Active course |
| `assignment_not_found` | no active assignment for that course and student |
| `lesson_not_found` (existing) | lesson missing, deleted or not the admin's |
| `forbidden` (existing) | a student isn't linked to the admin |

Past `dueAt` values are allowed ("Already overdue" is a client warning only).

## Query invalidation after success

| Action | Invalidate |
| --- | --- |
| `saveAssignments` | `['courses','admin',courseId]`, `['courses','admin','list']`, `['assign',courseId]`, `['plan']` (prefix) |
| `setCourseDeadline`, `setLessonDeadline` | `['plan']` (prefix), `['assign',courseId]`, `['admin-student-courses',studentId]` |

Plan mutations update the week cache optimistically (move the card to the target day with the new `dueAt`) and roll back on error. Student queries (`['today']`, `['courses','student',…]`) refetch on mount and focus; there is no Realtime in 003 (SC-004).

## Notes
- No action accepts `assignedBy`, `setBy`, `status` or the course's owner from the client; the server derives them.
- The client builds `dueAt` from student-local inputs with `zonedToUtc` (research R3). The server stores the instant as given.
- `saveAssignments` runs at most one default-reminder insert per student (`skipDuplicates` on the partial unique index).
