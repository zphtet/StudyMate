# Contract: Server Actions (writes) — 002

Called from `useMutation`. Every action is built with `action()` from `src/lib/action.ts`: its input is parsed with the Zod schema the form uses (`src/features/courses/schemas.ts`), it **calls a guard first**, and it returns `Result<T>` (same shape as 001). Each `error.code` maps to `errors.<code>` in en, my and ja.

New error codes: `title_mismatch`, `course_not_found`, `lesson_not_found`, `section_not_found`, `resource_not_found`, `section_not_empty`, `restore_expired`, `content_too_long`, `invalid_section`, `copy_failed`.

## Field schemas (shared by forms and actions)

| Schema | Fields |
| --- | --- |
| `courseFieldsSchema` | `title` 1–120 (trimmed); `description` ≤ 1000 or empty → null; `icon` one grapheme, ≤ 2 code points; `color` one of 6 keys; `targetDate` `YYYY-MM-DD` or null; `levelTag` ≤ 20 or empty → null; `unlockInOrder` boolean; `allowStudentNotes` boolean; `status` `draft` \| `active` |
| `lessonFieldsSchema` | `title` 1–160; `estMinutes` integer 1–600; `sectionId` uuid or null; `unlockRule` discriminated union (data-model.md › Unlock rule); `contentMd` ≤ 204 800 UTF-8 bytes (else `content_too_long`); `assignmentPrompt` ≤ 2000 or empty → null; `requireSubmission` boolean |
| `resourceSchema` | `kind`; `name` 1–200; `link` → `url` (`https://` only); others → `storagePath` matching `^<courseId>/<lessonId>/[0-9a-f-]{36}\.[a-z0-9]{1,5}$` and `sizeBytes` ≤ 10 485 760 |

## Courses (`src/features/courses/actions.ts`)

| Action | Guard | Input | Success | Errors |
| --- | --- | --- | --- | --- |
| `createCourse` | `requireRole('admin')` | `courseFieldsSchema` + optional `copyFromId` | `{ id }`. With `copyFromId`, behaves as `duplicateCourse` with these fields | `course_not_found` (source), `copy_failed` |
| `updateCourse` | `requireCourseOwner` | `courseId` + `courseFieldsSchema`; for an Archived course, `status` is ignored and stays archived (it changes only via `setCourseStatus` / Unarchive) | updated course. If `unlockInOrder` changed, lesson rules are rewritten in the same transaction (data-model.md › Unlock rule) | `course_not_found` (deleted) |
| `setCourseStatus` | `requireCourseOwner` | `courseId`, `status` | `{ status }`. Allowed: draft ↔ active, active → archived, archived → active | `course_not_found`, `invalid_input` |
| `duplicateCourse` | `requireCourseOwner(sourceId)` | `sourceId` | `{ id }` of a Draft copy titled "{title} (copy)" (research R9) | `course_not_found`, `copy_failed` |
| `deleteCourse` | `requireCourseOwner` | `courseId`, `confirmTitle` | `{}`; `deletedAt` set | `title_mismatch` (trimmed `confirmTitle` ≠ title), `course_not_found` |
| `restoreCourse` | `requireCourseOwner` | `courseId` | `{}`; `deletedAt` cleared | `restore_expired` (> 30 days), `course_not_found` |

## Sections (`src/features/courses/actions.ts`)

Guard: `requireRole('admin')`; every query scoped by `course: { ownerId: me.id, deletedAt: null }`.

| Action | Input | Success | Errors |
| --- | --- | --- | --- |
| `addSection` | `courseId`, `title` 1–80 | `{ id }` at the end | `course_not_found` |
| `renameSection` | `sectionId`, `title` | `{}` | `section_not_found` |
| `moveSection` | `sectionId`, `direction` `up` \| `down` | `{}`; positions renumbered | `section_not_found` |
| `deleteSection` | `sectionId` | `{}` | `section_not_empty`, `section_not_found` |

## Lessons (`src/features/courses/lesson-actions.ts`)

| Action | Guard | Input | Success | Errors |
| --- | --- | --- | --- | --- |
| `createLesson` | `requireCourseOwner` | `courseId`, `sectionId` or null | `{ id }`: Draft, translated "New lesson" title, rule from the course switch, last in its group | `course_not_found`, `invalid_section` |
| `saveLesson` (autosave) | `requireLessonOwner` | `lessonId` + `lessonFieldsSchema` | `{ updatedAt }`. Moving to another section appends it there and renumbers both groups. Live at once if Published | `lesson_not_found` (deleted), `invalid_section`, `content_too_long` |
| `setLessonStatus` | `requireLessonOwner` | `lessonId`, `status` `draft` \| `published` | `{ status }` ("Publish", "Unpublish instead") | `lesson_not_found` |
| `reorderLessons` | `requireCourseOwner` | `courseId`, `groups: { sectionId: string \| null; lessonIds: string[] }[]` (affected groups, full order) | `{}`; positions rewritten in one transaction. Lessons of an affected group missing from `lessonIds` (added or moved there by another device) keep their relative order after the listed ones; a listed lesson currently in another group moves to the listed group (last write wins) | `invalid_input` (an id not in the course, or listed twice), `invalid_section` |
| `deleteLesson` | `requireLessonOwner` | `lessonId` | `{}`; `deletedAt` set; group renumbered | `lesson_not_found` |
| `restoreLesson` | `requireLessonOwner` | `lessonId` | `{}`; old position, group renumbered; to "no section" if its section is gone | `restore_expired`, `lesson_not_found` |
| `addLessonResource` | `requireLessonOwner` | `lessonId` + `resourceSchema` (file already uploaded by the browser, research R3) | `Resource` (contracts/route-handlers.md) | `lesson_not_found`, `invalid_input` (path not under this lesson) |
| `removeLessonResource` | `requireRole('admin')`, scoped by `lesson: { course: { ownerId: me.id } }` | `resourceId` | `{}`; row deleted, then file removed with the caller's Storage client | `resource_not_found` |

## Query invalidation after success

| Actions | Invalidate |
| --- | --- |
| course actions | `['courses','admin']` (prefix); delete/restore also `['courses','admin','deleted']` |
| section actions, `createLesson`, `reorderLessons` | `['courses','admin',courseId]` |
| `saveLesson` | sets `['lessons','admin',lessonId]` from the response (`updatedAt`); invalidates `['courses','admin',courseId]` only when title, minutes, section or status changed |
| `setLessonStatus`, `deleteLesson`, `restoreLesson` | `['courses','admin',courseId]`, `['courses','admin','list']`, `['courses','admin','deleted']` |
| resource actions | `['lessons','admin',lessonId]` |

Student queries refetch on focus and mount (`staleTime` 30 s). There is no Realtime in 002.

## Notes
- `saveLesson` uses mutation `scope: { id: 'lesson:<lessonId>' }`, so autosaves run one after another (research R6).
- Bytes are counted with `TextEncoder` on both client and server. The database CHECK is the final limit.
- No action accepts `ownerId`, `isPersonal` or `position` from the client. The server derives them.
