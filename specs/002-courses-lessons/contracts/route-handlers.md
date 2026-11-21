# Contract: Route Handlers (reads) — 002

All reads go through TanStack Query (`src/features/courses/queries.ts`) → these handlers → repo (Prisma). Each handler is wrapped in `handle()` and **calls a guard before any Prisma query**. Error shape and status codes are as in 001 (`{ "error": { "code", "message" } }`), plus **403 `lesson_locked`** via `HttpError` (research R13).

Dates: instants are ISO 8601 UTC strings; calendar dates (`targetDate`, `on_date`) are `YYYY-MM-DD`.

Shared types:
```ts
type CourseColor = 'indigo' | 'teal' | 'rust' | 'berry' | 'green' | 'slate'
type CourseStatus = 'draft' | 'active' | 'archived'
type UnlockRule = { type: 'none' } | { type: 'after_previous' } | { type: 'on_date'; date: string }
type ResourceKind = 'file' | 'link' | 'audio' | 'image'
type Resource = { id: string; kind: ResourceKind; name: string; url: string; sizeBytes: number | null }
// url = '/api/lesson-files/<id>/<name>' for stored files, the external https URL for links
```

---

## Admin

### GET `/api/admin/courses`
Guard: `requireRole('admin')`. All non-deleted courses with `ownerId` = caller and `isPersonal = false`, newest `updatedAt` first. Filtering and search happen on the client (research R10).

```ts
type AdminCourseListItem = {
  id: string; title: string; icon: string; color: CourseColor
  levelTag: string | null; targetDate: string | null; status: CourseStatus
  lessonCount: number                 // non-deleted lessons, any status
  sectionCount: number
  students: { id: string; displayName: string }[]   // active assignments (003); [] until then
  avgPercent: number | null           // mean course_progress.percent over assigned students
  updatedAt: string
}
type AdminCourseList = AdminCourseListItem[]
```

### GET `/api/admin/courses/[courseId]`
Guard: `requireCourseOwner(courseId)`; 404 `course_not_found` if deleted.

```ts
type AdminLessonRow = {
  id: string; number: number; title: string; estMinutes: number
  status: 'draft' | 'published'
  hasAssignment: boolean            // assignmentPrompt not empty
  hasAudio: boolean                 // has an audio resource
}
type AdminCourseDetail = {
  course: {
    id: string; title: string; description: string | null; icon: string; color: CourseColor
    levelTag: string | null; targetDate: string | null; unlockInOrder: boolean
    allowStudentNotes: boolean; status: CourseStatus; lessonCount: number
  }
  students: { id: string; displayName: string; percent: number | null }[]   // [] until 003
  groups: { section: { id: string; title: string } | null; lessons: AdminLessonRow[] }[]
  // course order; the null-section group is present when it has lessons or the course has no sections
  // (so "+ Add lesson" always has a place); empty sections are included
}
```

### GET `/api/admin/lessons/[lessonId]`
Guard: `requireLessonOwner(lessonId)`; 404 `lesson_not_found` if the lesson or its course is deleted.

```ts
type AdminLesson = {
  id: string; courseId: string; courseTitle: string; number: number
  title: string; estMinutes: number; sectionId: string | null; unlockRule: UnlockRule
  contentMd: string; assignmentPrompt: string | null; requireSubmission: boolean
  status: 'draft' | 'published'; updatedAt: string
  sections: { id: string; title: string }[]          // for the Section select
  previousLesson: { number: number; title: string } | null   // label for "After 12"
  resources: Resource[]                               // attachments and inline media
}
```

### GET `/api/admin/lessons/[lessonId]/impact`
Guard: `requireLessonOwner(lessonId)`. Students with an active assignment to the lesson's course, by name.

```ts
type LessonImpact = {
  students: {
    id: string; displayName: string
    work: 'not_started' | 'in_progress' | 'done' | 'draft_assignment' | 'submitted' | 'reviewed'
  }[]                                                  // derivation: data-model.md › Student work
}
```

### GET `/api/admin/courses/deleted`
Guard: `requireRole('admin')`. Items deleted within the last 30 days, newest first.

```ts
type RecentlyDeleted = {
  courses: { id: string; title: string; icon: string; color: CourseColor; lessonCount: number; deletedAt: string; purgeAt: string }[]
  lessons: { id: string; title: string; course: { id: string; title: string }; deletedAt: string; purgeAt: string }[]
  // lessons only when their course is not deleted (they return with the course)
}
```

---

## Student

### GET `/api/courses`
Guard: `requireRole('student')`. Courses with an active assignment for the caller, not deleted, status `active` or `archived`.

```ts
type StudentCourseCard = {
  id: string; title: string; icon: string; color: CourseColor
  levelTag: string | null; targetDate: string | null
  lessonCount: number             // lessons this student can see
  admin: { displayName: string }
}
type StudentCourseList = { active: StudentCourseCard[]; archived: StudentCourseCard[] }
```

### GET `/api/courses/[courseId]`
Guards: `requireRole('student')`, then `requireCourseReader(courseId)`; 404 `course_not_found` otherwise.

```ts
type LockInfo =
  | { reason: 'after_previous'; previous: { number: number; title: string } }
  | { reason: 'on_date'; date: string }
type StudentLessonRow = {
  id: string; number: number; title: string; estMinutes: number
  state: 'open' | 'locked'; lock: LockInfo | null
}
type StudentCourse = {
  course: {
    id: string; title: string; icon: string; color: CourseColor; description: string | null
    targetDate: string | null; status: 'active' | 'archived'; admin: { displayName: string }
  }
  lessonCount: number
  groups: { section: { id: string; title: string } | null; lessons: StudentLessonRow[] }[]
  // only Published, non-deleted lessons; archived courses: completed lessons only (all 'open');
  // sections with no visible lessons are omitted
}
```

### GET `/api/lessons/[lessonId]`
Guards: `requireRole('student')`, then `requireLessonReader(lessonId)`; then the lock check (research R1). 404 `lesson_not_found` if not readable; **403 `lesson_locked`** if locked.

```ts
type StudentLesson = {
  id: string; title: string; estMinutes: number
  number: number; total: number                 // "Lesson 13 of 20" over visible lessons
  course: { id: string; title: string }
  contentMd: string
  assignmentPrompt: string | null; requireSubmission: boolean
  attachments: Resource[]                       // kind 'file' | 'link' only
}
```

---

## Files

### GET `/api/lesson-files/[resourceId]/[name]`
Guard: `requireUser()`, then:
- the caller owns the resource's course (`requireLessonOwner`), or
- the caller passes `requireLessonReader` and the lesson isn't locked.

Response: **302** to a signed URL valid 1 hour, created with the caller's server Supabase client (Storage RLS applies). Header `Cache-Control: private, max-age=300`. `link` resources → 404. Not visible → 404 `file_not_found`; locked → 403 `lesson_locked`. `[name]` is ignored by the server.

---

## Cron

### GET `/api/cron/purge`
No user guard. Requires `Authorization: Bearer ${CRON_SECRET}`, else 401 (plan.md › Complexity Tracking). Scheduled daily by `vercel.json` `crons`. Runs `purgeExpired(new Date())` (research R8).

```ts
type PurgeResult = { courses: number; lessons: number; files: number }
```

---

**Query keys** (`src/features/courses/queries.ts`):

| Key | Endpoint |
| --- | --- |
| `['courses','admin','list']` | `/api/admin/courses` |
| `['courses','admin',courseId]` | `/api/admin/courses/[id]` |
| `['courses','admin','deleted']` | `/api/admin/courses/deleted` |
| `['lessons','admin',lessonId]` | `/api/admin/lessons/[id]` |
| `['lessons','admin',lessonId,'impact']` | `/api/admin/lessons/[id]/impact` |
| `['courses','student','list']` | `/api/courses` |
| `['courses','student',courseId]` | `/api/courses/[id]` |
| `['lessons','student',lessonId]` | `/api/lessons/[id]` |
