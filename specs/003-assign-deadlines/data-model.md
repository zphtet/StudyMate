# Data Model: Assigning Courses and Deadlines (003)

The tables already exist in `0_init` (docs/data-model.md §3). 003 adds one index, one partial unique index and one tightened policy, and defines the rules the app applies. Field names are the database names; Prisma names are camelCase.

## Entities

### CourseAssignment (`course_assignments`)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid PK | |
| `course_id` | uuid → courses | the admin's own course; must be `active` and not deleted when assigned or deadline-edited |
| `student_id` | uuid → profiles | actively linked to the admin (`student_links.status = 'active'`) |
| `assigned_by` | uuid → profiles | the acting admin (set by the server, never from the client) |
| `due_at` | timestamptz, null | the course deadline; null = no course deadline. Stored UTC (FR-008) |
| `status` | text `active` / `removed` | CHECK exists |
| `created_at` | timestamptz | |

Unique (`course_id`, `student_id`), so there is at most one row per pair (FR-002). The existing partial index `course_assignments_student (student_id) where status = 'active'` serves student reads.

### LessonDeadline (`lesson_deadlines`)

| Field | Type | Rules |
| --- | --- | --- |
| `lesson_id` | uuid → lessons | **Published**, not deleted, in a course the admin owns, whose course has an **active** assignment for `student_id` (FR-003) |
| `student_id` | uuid → profiles | actively linked to the admin |
| `due_at` | timestamptz | required; stored UTC. May be later than the course deadline (clarification) |
| `set_by` | uuid → profiles | the acting admin (server-set) |

PK (`lesson_id`, `student_id`). FK `on delete cascade` from `lessons`, so a lesson purged after 30 days (002) takes its deadlines with it. Soft-deleting or unpublishing keeps them (spec Edge Cases).

**New index** (Prisma `@@index([studentId, dueAt], map: "lesson_deadlines_student_due")`): Plan ranges and Today look deadlines up by student and time.

### Used from other features (not changed by 003, except where noted)

- **Course** (002): `status`, `deleted_at`, `target_date` (pre-fills the Assign sheet only), `unlock_in_order` (changed through the Assign sheet with 002's rule rewrite).
- **Lesson** (002): `status`, `deleted_at`, `est_minutes`, order fields.
- **LessonProgress** (004): `status = 'done'` means done; tests insert rows.
- **Profile** (001): `timezone`, `locale`, `display_name`, availability settings read by `busy_segments`.
- **Shift** (005): read only, through `busy_segments`; tests insert rows.
- **NotificationRule** (006): 003 inserts the default set (below).
- **Notification** (006): 003 upserts notices (below).

## Derived values (never stored)

| Value | Rule | Where |
| --- | --- | --- |
| Effective deadline | `lesson_deadlines.due_at` ?? active `course_assignments.due_at` ?? none (FR-004) | `effectiveDue()` in `assignments/status.ts`; SQL `effective_due()` |
| Counts toward statuses | lesson `published`, `deleted_at is null`, course `active` and not deleted, assignment `active` (FR-006) | repo `where` clauses |
| Status | `done` → `overdue` → `due_soon` (≤ 24 h) → `locked` → `upcoming` → `none` (FR-005; research R1) | `deadlineStatus()` |
| Days late | calendar days from the due date to today, both in the student's zone; 0 = "Overdue" | `calendarDaysBetween()` |
| Course card status (Plan) | `done` when every counting lesson is done; otherwise the status rules on the course `due_at` | `courseDeadlineStatus()` |
| Clash | not done, `due_at > now`, inside a Shift or Sleep display segment (`shift`, `sleep`, `night`; not `quiet`) | `lib/availability.ts` (research R7) |
| Suggestion | first free gap after the busy block that fits `max(est_minutes, 60)` min; gap start + minutes, rounded up to the local hour; 7-day search | `suggestSlot()` |

## Lifecycles

### Assignment

```text
(none) ──assign──► active ──untick + confirm──► removed ──assign again──► active
                     │  ▲                                    (due_at from the sheet;
                     └──┘ assign again = update due_at        lesson deadlines kept)
```

- `removed` hides the course from the student (`can_read_course` and the guards require `active`), keeps `lesson_progress`, `submissions` and `lesson_deadlines` (FR-007), and removes its cards from the Plan.
- Archived course: the assignment stays `active` (002 keeps completed lessons readable). Its deadlines stop counting (FR-006).
- Student unlinked (001): assignments are untouched, but no guard passes for that admin and student, so the deadlines stop showing.

### Lesson deadline

```text
(none) ──set──► set ──change──► set
                 │
                 └──remove──► (none)   (lesson falls back to the course deadline)
lesson unpublished / soft-deleted → hidden, kept · restored / republished → shown · purged → deleted (cascade)
```

## Notifications recorded by 003 (spec FR-012; research R8)

| Event | `source_type` | `source_id` | `occurrence_key` | url |
| --- | --- | --- | --- | --- |
| Assigned with "Notify students now" (new or reassigned students only) | `system` | course id | `assigned` | `/s/courses/<courseId>` |
| Course deadline set, changed or removed for an assigned student | `system` | course id | `deadline` | `/s/courses/<courseId>` |
| Lesson deadline set, changed or removed | `system` | lesson id | `deadline` | `/s/lessons/<lessonId>` |

Upsert on the existing unique key (`source_type`, `source_id`, `user_id`, `occurrence_key`), setting `title`, `body`, `url`, `sent_at = now()` and `read_at = null`: one row per student and item, replaced by the latest change whether or not the earlier one was read (spec FR-012). Text is in the student's locale, with times in the student's zone. Nothing is recorded when a value didn't actually change.

## Default reminder set (spec FR-013; research R9)

| `trigger` | `config` |
| --- | --- |
| `daily` | `{"preset":"default","time":"20:00","days":[1,2,3,4,5,6,7]}` |
| `due_soon` | `{"preset":"default","offsets_h":[24,2]}` |
| `overdue` | `{"preset":"default","time":"19:00","max":3}` |
| `streak_risk` | `{"preset":"default","time":"21:30"}` |

`admin_id` = me, `student_id` = the student, `message` from `reminders.default.<trigger>` in the student's locale, `channels` `{push,inapp}`, `enabled` true. Each set is inserted at most once per (admin, student) through the partial unique index below.

## Migration `<UTC timestamp>_assign_deadlines`

Generated per docs/data-model.md §7 (diff the committed `schema.prisma` against the edited one), then completed by hand.

**Prisma diff** (from adding `@@index([studentId, dueAt], map: "lesson_deadlines_student_due")` to `LessonDeadline`):
- `CREATE INDEX "lesson_deadlines_student_due" ON "lesson_deadlines"("student_id", "due_at");`

**Added by hand**:
1. Replace `deadlines_write` (deliberate, hand-written; not a Prisma drop):
   ```text
   for all
   using      ( is_admin_of(student_id) and <lesson in my course with an active assignment> )
   with check ( is_admin_of(student_id) and set_by = auth.uid() and <same> )
   <same> = exists (select 1 from lessons l
                    join course_assignments a on a.course_id = l.course_id
                    where l.id = lesson_id and owns_course(l.course_id)
                      and l.status = 'published' and l.deleted_at is null
                      and a.student_id = lesson_deadlines.student_id and a.status = 'active')
   ```
2. `create unique index notification_rules_default_once on notification_rules (admin_id, student_id, trigger) where config->>'preset' = 'default';`

`assign_read`, `assign_write` and `deadlines_read` stay as in 0_init; they already match the guards. Before applying, check that the dev database has no duplicate default rules (none exist; 006 isn't built).

`docs/data-model.md` is updated in the same change: the `lesson_deadlines` row gains the index; §4 lists the replaced policy and the partial unique index.

## Guards (mirror the SQL)

| Guard | Allows | Mirrors |
| --- | --- | --- |
| `requireAdminOf(studentId)` (existing) | admin actively linked to the student | `is_admin_of` |
| `requireCourseOwner(courseId)` (existing) | owner of the course | `owns_course` |
| `requireAdminOfAll(studentIds)` (**new**) | admin actively linked to **every** listed student (one query; count must match) | `is_admin_of` per row (`assign_write`) |
| `requireAssignmentOwner(courseId, studentId)` (**new**) | owner of the course, linked to the student, assignment `active`; returns the assignment | `assign_write` |
| `requireLessonDeadlineTarget(lessonId, studentId)` (**new**) | owner of the lesson's course, lesson Published and not deleted, linked to the student, active assignment of that course (the same conditions as the policy) | new `deadlines_write` |

Student reads use `requireRole('student')` with `studentId: me.id` in every Prisma `where`. 002's `readableCourse()` is narrowed to `status: 'active'` assignments for deadline counts.
