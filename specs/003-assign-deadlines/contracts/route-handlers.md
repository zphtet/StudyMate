# Contract: Route Handlers (reads) — 003

All reads go through TanStack Query (`src/features/assignments/queries.ts`, plus 002's `src/features/courses/queries.ts` for the extended endpoints) → these handlers → repo (Prisma). Each handler is wrapped in `handle()` and **calls a guard before any Prisma query**. Errors use the 001/002 shape `{ "error": { "code", "message" } }`.

Dates: instants are ISO 8601 UTC strings. Calendar dates (`week`, `month`, day keys) are `YYYY-MM-DD` / `YYYY-MM` **in the student's zone**.

Shared types:
```ts
type DeadlineStatus = 'done' | 'overdue' | 'due_soon' | 'locked' | 'upcoming' | 'none'
type Due = { dueAt: string; status: DeadlineStatus; daysLate: number } // daysLate only meaningful when overdue
type Clash = { kind: 'shift' | 'sleep'; suggestion: string | null }     // suggestion = new dueAt or null
type Segment = { kind: 'shift' | 'sleep'; start: string; end: string } // free = the gaps
type StudentRef = { id: string; displayName: string; timezone: string }
```

---

## Admin

### GET `/api/admin/courses/[courseId]/assign`
Guard: `requireCourseOwner(courseId)`. Data for the Assign sheet.
```ts
{
  course: { id: string; title: string; status: 'draft' | 'active' | 'archived'; targetDate: string | null; unlockInOrder: boolean }
  students: (StudentRef & { assigned: boolean; dueAt: string | null })[] // all actively linked students, by name
}
```
`dueAt` is the current course deadline for assigned students. For unassigned students the client pre-fills it from `targetDate` (research R5).

### GET `/api/admin/students`
Guard: `requireRole('admin')`. Linked students for the Plan chips: `StudentRef[]` ordered by `displayName`. Only `student_links.status = 'active'` with `adminId = me.id`.

### GET `/api/admin/students/[studentId]/courses`
Guard: `requireAdminOf(studentId)`. Courses and lessons for the "+ Deadline" sheet: the admin's own **active** courses with an **active** assignment for this student.
```ts
{ id: string; title: string; dueAt: string | null;
  lessons: { id: string; number: number; title: string; estMinutes: number; dueAt: string | null }[] }[]
// lessons: Published, non-deleted, in course order (002 order.ts); dueAt = this student's own lesson deadline
```

### GET `/api/admin/students/[studentId]/clash?at=<ISO>&minutes=<n>`
Guard: `requireAdminOf(studentId)`. Shift/sleep check while picking a time (research R7). `minutes` defaults to 60 (min 60, max 600).
```ts
{ clash: Clash | null }
```

### GET `/api/admin/plan?studentId=<id>&week=<YYYY-MM-DD>`
Guard: `requireAdminOf(studentId)`. `week` = a Monday in the student's zone (400 `invalid_input` otherwise; missing → current week).
```ts
{
  student: StudentRef
  adminTimezone: string          // the caller's zone, for TimeBoth when it differs (spec FR-008)
  now: string
  days: {
    date: string                 // student-local YYYY-MM-DD, Mon..Sun
    start: string; end: string   // the local day's real bounds (23/25 h on DST changes)
    segments: Segment[]          // clipped to the day
    cards: PlanCard[]            // ordered by dueAt
  }[]
}
type PlanCard = {
  kind: 'lesson' | 'course'
  id: string                     // lessonId or courseId
  courseId: string
  title: string                  // lesson title, or course title for course cards
  courseTitle: string
  estMinutes: number | null      // lesson cards only
  due: Due
  clash: Clash | null            // only when not done and in the future
  draggable: boolean             // false when done
}
```
Lesson cards are lessons that have their **own** deadline for this student. Course cards are courses with a course deadline (one card per course, US4 scenario 4). Only counting lessons and courses (FR-006).

### GET `/api/admin/plan/month?studentId=<id>&month=<YYYY-MM>`
Guard: `requireAdminOf(studentId)`.
```ts
{ student: StudentRef; days: { date: string; count: number; late: number }[] } // only days with ≥ 1 card
```

### Changed: GET `/api/admin/courses/[courseId]` (002)
Unchanged shape. `students` keeps listing active assignments; the Assign button shows when `course.status === 'active'`.

---

## Student

### GET `/api/today`
Guard: `requireRole('student')`.
```ts
{
  overdue: TodayItem[]   // oldest dueAt first
  dueToday: TodayItem[]  // not done, due later today in the student's zone, earliest first
}
type TodayItem = {
  lessonId: string; title: string; estMinutes: number
  courseId: string; courseTitle: string
  due: Due
}
```
All items are returned; the client shows 5 per section, then "Show all (N)".

### Changed: GET `/api/courses` (002)
Each `active` course card gains:
```ts
{ dueAt: string | null; overdueCount: number }
```
Archived cards are unchanged (no deadlines).

### Changed: GET `/api/courses/[courseId]` (002)
`course` gains `dueAt: string | null` (the student's course deadline). Each lesson gains:
```ts
{ done: boolean; due: Due | null } // due null = no effective deadline (chip falls back to Open/Locked)
```
For Archived courses `due` is always null.
