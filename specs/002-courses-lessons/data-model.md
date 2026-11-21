# Data Model: Courses and Lessons (002)

Builds on `prisma/migrations/0_init` (see `docs/data-model.md`). The four tables already exist with RLS. Feature 002 adds **one column**, a few **CHECK constraints**, **one SQL function**, **updated read policies** (tables and Storage), **Storage bucket limits** and **two partial indexes**. Other tables are read but not written: `course_assignments` (003) and `lesson_progress` / `submissions` (004).

## Entities

### Course (`courses`)
| Field | Type | Rules in 002 |
| --- | --- | --- |
| `id` | uuid | |
| `ownerId` | uuid → profiles | the admin who created it (US5 personal courses deferred: `isPersonal` stays `false`) |
| `title` | text | 1–120 chars (existing CHECK) |
| `description` | text, nullable | ≤ 1000 chars (**new CHECK**) |
| `icon` | text | one grapheme, ≤ 2 code points (existing CHECK `char_length <= 2`; Zod checks the grapheme); default `文` |
| `color` | text | one of `indigo`, `teal`, `rust`, `berry`, `green`, `slate` (**new CHECK**); default `indigo` |
| `levelTag` | text, nullable | ≤ 20 chars (**new CHECK**) |
| `targetDate` | date, nullable | calendar date, no time zone |
| `unlockInOrder` | boolean | default `true`; see Unlock rule › course switch |
| `allowStudentNotes` | boolean | **new column** `allow_student_notes`, default `true`; stored only (clarification 2026-11-21) |
| `status` | `draft` \| `active` \| `archived` | see Course lifecycle |
| `deletedAt` | timestamptz, nullable | soft delete (FR-006) |
| `createdAt`, `updatedAt` | timestamptz | `updatedAt` set by the repo on every write (no trigger) |

### CourseSection (`course_sections`)
| Field | Type | Rules |
| --- | --- | --- |
| `courseId` | uuid → courses | cascade on hard delete |
| `title` | text | 1–80 chars (**new CHECK**) |
| `position` | int | ≥ 0 (**new CHECK**); 0..n−1 per course, no gaps |

No soft delete: a section can be deleted only when it has no non-deleted lessons. Soft-deleted lessons in it then get `section_id = null` (existing FK `on delete set null`).

### Lesson (`lessons`)
| Field | Type | Rules |
| --- | --- | --- |
| `courseId` | uuid → courses | fixed after creation |
| `sectionId` | uuid → course_sections, nullable | `null` = "no section" group; must belong to the same course (checked in the repo) |
| `title` | text | 1–160 chars (existing CHECK); new lessons start as the translated "New lesson" |
| `contentMd` | text | ≤ 204 800 bytes (existing CHECK; Zod counts UTF-8 bytes) |
| `estMinutes` | smallint | 1–600 (existing CHECK); default 15 |
| `assignmentPrompt` | text, nullable | ≤ 2000 chars (**new CHECK**) |
| `requireSubmission` | boolean | "Submit assignment before marking complete"; used by 004 |
| `unlockRule` | jsonb | see Unlock rule; shape enforced by a **new CHECK** and Zod |
| `status` | `draft` \| `published` | see Lesson lifecycle |
| `position` | int | ≥ 0 (**new CHECK**); 0..n−1 within its group, no gaps |
| `deletedAt` | timestamptz, nullable | soft delete |
| `updatedAt` | timestamptz | set on every save; shown as "Saved hh:mm" |

### LessonResource (`lesson_resources`)
| Field | Type | Rules |
| --- | --- | --- |
| `lessonId` | uuid → lessons | cascade on hard delete |
| `kind` | `file` \| `link` \| `audio` \| `image` | `file`, `link` = **attachments** (listed under "Attachments"); `image`, `audio` = **inline media** referenced from the Markdown |
| `name` | text | 1–200 chars (**new CHECK**); the original file name or link title |
| `url` | text, nullable | `https://` URL; set only for `link` |
| `storagePath` | text, nullable | `<course_id>/<lesson_id>/<uuid>.<ext>` in bucket `lesson-files`; set for every kind except `link` |
| `sizeBytes` | bigint, nullable | ≤ 10 485 760 |

**New CHECK**: `link` ⇔ (`url` set, `storage_path` null); every other kind ⇔ (`storage_path` set, `url` null).

Removing an attachment ("×") hard-deletes the row and its file at once. Soft delete applies to courses and lessons only. Inline media whose Markdown reference is deleted stays until the lesson or course is purged (accepted; it is invisible to students).

## Unlock rule

```ts
type UnlockRule =
  | { type: 'none' }                    // always open
  | { type: 'after_previous' }          // open when the previous visible lesson is done
  | { type: 'on_date'; date: string }   // 'YYYY-MM-DD'; opens 00:00 in the student's time zone
```

- **New CHECK** on `unlock_rule`: `type` in the three values; `on_date` requires `date` matching `^\d{4}-\d{2}-\d{2}$`.
- **Course switch** (clarification 2026-11-21):
  - New lessons get `after_previous` when `unlockInOrder` is on, `none` when it's off.
  - Changing the switch rewrites the rule of every lesson in the course whose type is `none` or `after_previous` (on → `after_previous`, off → `none`), in the same transaction as the course update. `on_date` lessons keep their date.
  - Locking reads only the lesson's own rule.
- **Previous lesson** = the previous Published, non-deleted lesson in course order. Evaluation lives in `src/features/courses/lock.ts` (research R1).

## Ordering

Course order is the "no section" group first, then sections by `position`. Inside a group, lessons go by `position`. Positions are renumbered by the server after every reorder, move, delete and restore (research R7). Lesson numbers are computed per viewer, never stored.

## Lifecycles

### Course
```
          create (form status)
              │
   ┌──────────▼─────────┐   setCourseStatus     ┌────────────┐   archive    ┌────────────┐
   │       draft        │ ◄───────────────────► │   active   │ ───────────► │  archived  │
   │ (only the admin)   │                       │ (assigned  │ ◄─────────── │ (completed │
   └────────────────────┘                       │  students) │   unarchive  │ lessons    │
                                                └────────────┘              │ read-only) │
                                                                            └────────────┘
   any status ──deleteCourse(confirm title)──► deleted_at set ──restore ≤ 30 days──► previous status
                                               └──purge > 30 days──► row and files removed
```
- Only `active` courses can be assigned (003, US1 scenario 3).
- Students see `active` courses, and `archived` ones in an "Archived" group with completed lessons only (FR-005, clarified).

### Lesson
```
   createLesson ──► draft ◄──── publish / unpublish ────► published
   any ──deleteLesson──► deleted_at set ──restore ≤ 30 days──► same status, old position
                                        └──purge > 30 days──► row, resources, files, student work removed
```
- Students see a lesson only when it is `published`, not deleted, in a course they can read, and (for archived courses) completed. That is `can_read_lesson`, below.
- Saving a Published lesson changes what students see immediately (clarification 2026-11-21).

## Student work shown in 002 (read only)

The delete-lesson sheet lists assigned students with one **work state**, read from 004's tables (empty until 004 ships):

| Submission row | Progress row | Work state |
| --- | --- | --- |
| `reviewed` | any | `reviewed` |
| `submitted` or `needs_redo` | any | `submitted` |
| `draft` | any | `draft_assignment` |
| none | `done` | `done` |
| none | `in_progress` | `in_progress` |
| none | none or `not_started` | `not_started` |

## Copy rules (`duplicateCourse`, research R9)

| Copied | Not copied |
| --- | --- |
| Course fields (form values override), sections, non-deleted lessons (as **Draft**, same positions, rules and prompts), resources and their files (new paths), Markdown with resource ids rewritten | Deleted lessons, assignments, deadlines, progress, submissions, study sessions, comments |

## Storage

| Bucket | Path | Read | Write / delete |
| --- | --- | --- | --- |
| `lesson-files` (private) | `<course_id>/<lesson_id>/<uuid>.<ext>` | `owns_course(folder 1)` or `can_read_lesson(folder 2)` | insert: `owns_course(folder 1)` **and** lesson `folder 2` belongs to course `folder 1`; delete: `owns_course(folder 1)` |

Bucket settings: `file_size_limit = 10485760`, `allowed_mime_types` = the research R3 allow-list.

## Migration `<UTC timestamp>_courses_lessons`

Generated per `docs/data-model.md` §7 (diff the committed `schema.prisma` against the edited one), then completed by hand.

**Prisma diff** (from adding `allowStudentNotes Boolean @default(true) @map("allow_student_notes")` to `Course`):
- `ALTER TABLE "courses" ADD COLUMN "allow_student_notes" BOOLEAN NOT NULL DEFAULT true;`

**Added by hand**:
1. CHECK constraints: `courses_color_check`, `courses_description_check`, `courses_level_tag_check`, `course_sections_title_check`, `course_sections_position_check`, `lessons_position_check`, `lessons_assignment_prompt_check`, `lessons_unlock_rule_check`, `lesson_resources_name_check`, `lesson_resources_size_check`, `lesson_resources_target_check` (rules in the tables above).
2. Function `public.can_read_lesson(p_lesson uuid) returns boolean` (`stable security definer set search_path = public`). True when either:
   - the caller owns the lesson's course; or
   - all of: the lesson is `published`; `deleted_at is null`; `can_read_course(course_id)`; and (course status ≠ `archived`, **or** the course is personal, **or** a `lesson_progress` row for (`auth.uid()`, lesson) has status `done`).
3. Replace policies (deliberate, hand-written; not a Prisma drop):
   - `lessons_read` → `using (can_read_lesson(id))`;
   - `resources_read` → `using (can_read_lesson(lesson_id))`;
   - `lesson_files_read` on `storage.objects` → Storage table above;
   - `lesson_files_write` on `storage.objects` → Storage table above.
4. `update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array[…] where id = 'lesson-files';`
5. Partial indexes for "Recently deleted" and the purge: `courses_deleted (owner_id, deleted_at) where deleted_at is not null`; `lessons_deleted (course_id, deleted_at) where deleted_at is not null`.

Before applying, check that the dev database has no rows breaking the new CHECKs. Only test fixtures exist, and `color` defaults to `indigo`.

`docs/data-model.md` is updated in the same change: the `courses` row gains `allow_student_notes`; §4 lists `can_read_lesson` and the new CHECKs.

## Guards (mirror the SQL)

| Guard | Allows | Mirrors |
| --- | --- | --- |
| `requireCourseOwner(courseId)` (existing) | owner, including deleted courses (needed for restore) | `owns_course` |
| `requireCourseReader(courseId)` (existing) | owner; linked admin of a personal course; assigned student of an active or archived course | `can_read_course` |
| `requireLessonOwner(lessonId)` (**new**) | owner of the lesson's course, deleted lessons included | `owns_course(l.course_id)` |
| `requireLessonReader(lessonId)` (**new**) | as `can_read_lesson` (the archived → completed-only rule included) | `can_read_lesson` |

Section and resource writes use `requireRole('admin')` and scope the Prisma `where` with `course: { ownerId: me.id }`.
