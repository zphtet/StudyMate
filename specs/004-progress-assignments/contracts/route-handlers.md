# Contract: Route Handlers (reads) — 004

All reads go through TanStack Query (`src/features/progress/queries.ts`) to these handlers, which call the repo (Prisma). The one exception is the additions to 002's course endpoints, which stay in `src/features/courses/queries.ts`.

Each handler is wrapped in `handle()` and **calls a guard before any Prisma query**. Errors use the 001–003 shape `{ "error": { "code", "message" } }`.

Dates: instants are ISO 8601 UTC strings. Calendar dates are `YYYY-MM-DD` **in the student's zone**. Durations are whole **seconds** (the client formats "7 h 40 m").

Shared types:
```ts
type SubmissionStatus = 'draft' | 'submitted' | 'reviewed' | 'needs_redo'
type Attachment = { path: string; name: string; size: number; url: string } // url = /api/submissions/<id>/files/<basename of path>
type Comment = { id: string; authorId: string; authorName: string; isMine: boolean; body: string; createdAt: string }
type Streak = { current: number; best: number }
type Forecast =
  | { kind: 'finished' }
  | { kind: 'empty' }                                   // 0 published lessons → "—"
  | { kind: 'no_pace'; remaining: number }
  | { kind: 'no_deadline'; remaining: number; finishOn: string | null }
  | { kind: 'on_track' | 'behind'; finishOn: string; dueOn: string }
type CourseProgress = { courseId: string; title: string; accent: string; percent: number | null; done: number; total: number }
```

---

## Student

### GET `/api/lessons/[lessonId]/work`
Guard: `requireRole('student')`, `requireLessonReader(lessonId)`, then `placeStudentLesson` (404 `lesson_not_found`, 403 `lesson_locked`, as 002's lesson endpoint).
```ts
{
  studentId: string                // the caller: owner of the Notes thread and the photo folder
  progress: { done: boolean; completedAt: string | null; completedByName: string | null; minutes: number } // minutes = credit + sessions
  submission: { id: string; status: SubmissionStatus; bodyMd: string; attachments: Attachment[];
                submittedAt: string | null; reviewedAt: string | null; updatedAt: string } | null
  reviewComments: Comment[]        // on this submission, oldest first
  notesCount: number
  adminName: string | null         // the actively linked Admin ("Zin asked for a redo", Notes empty state)
  nextLessonId: string | null      // next visible lesson in course order
}
```
- `completedByName` is set only when someone other than the student marked it ("Marked done by Zin").
- `updatedAt` is the last save ("Draft saved · 21:04"). `studentId`, `adminName` and `updatedAt` were added during US2 so the screen needs no second request.
- All reads run in one round of queries: Realtime refetches this after every review (research R10).

### GET `/api/lessons/[lessonId]/notes?studentId=<id>`
Guards:
- **Student**: `requireLessonReader(lessonId)`. `studentId` must be absent or equal to `me.id`.
- **Admin**: `requireAdminLessonTarget(lessonId, studentId)`.

Returns `{ comments: Comment[] }`: the Notes thread, oldest first, at most 200. Threads are short; older comments beyond 200 aren't returned. The client always sends `studentId` (a student sends their own id), so both roles share one query key.

### GET `/api/focus`
Guard: `requireRole('student')`.
```ts
{ now: string; session: { id: string; lessonId: string | null; lessonTitle: string | null;
                          startedAt: string; plannedMinutes: 15 | 25 } | null }
```
`session` is the open session, if one is still within its planned length. An expired open session is reported as `null`, because it already counts in full (research R3).

### GET `/api/progress?view=month|week`
Guard: `requireRole('student')`. A missing or invalid `view` gives `month`.
```ts
{
  today: string
  streak: Streak
  goal: { days: number; activeThisWeek: number }
  period: { from: string; to: string }                // the local month or week
  studied: { seconds: number; activeDays: number }
  lessonsDone: { count: number; previous: number }    // vs the previous month or week
  days: { date: string; seconds: number; completions: number; level: 0 | 1 | 2 | 3 | 4 }[] // every day of the period
  courses: (CourseProgress & { dueAt: string | null; forecast: Forecast })[] // active assignments, by title
}
```
The Courses tab uses `view=week` for its "Studied this week" card.

### GET `/api/progress/summary`
Guard: `requireRole('student')`. Feeds the Today cards.
```ts
{
  streak: Streak
  week: { activeDays: number; goal: number; days: boolean[] }   // Mon..Sun active flags, for the 5 dots
  continue: { courseId: string; courseTitle: string; lessonId: string; lessonTitle: string;
              number: number; done: number; total: number } | null
}
```

### GET `/api/submissions/[submissionId]/files/[name]`
Guard:
- the student who owns the submission; or
- `requireSubmissionReviewer(submissionId)` (linked Admin, non-Draft).

`name` must match an `attachments[].path` basename, otherwise 404 `file_not_found`. Redirects (302) to a 1-hour signed URL made with the **caller's** Supabase client, so Storage RLS also applies. `Cache-Control: private, max-age=300`.

### Changed: GET `/api/courses` (002/003)
Each `active` course card gains:
```ts
{ percent: number | null; doneCount: number } // course_progress; null = no published lessons
```

### Changed: GET `/api/courses/[courseId]` (002/003)
`course` gains `progress: { percent: number | null; done: number; total: number }`.

---

## Admin

### GET `/api/admin/students/progress`
Guard: `requireRole('admin')`. Data for every actively linked student, from a fixed number of queries (research R2, R12).
```ts
{
  students: {
    id: string; displayName: string; timezone: string
    overdueCount: number               // 003 rules (countOverdue)
    toReview: number                   // submissions with status 'submitted'
    streak: Streak
    weekSeconds: number                // this local week of the student
    weekLessonsDone: number
    courses: CourseProgress[]          // active assignments of the admin's courses
  }[]                                  // by displayName
}
```

### GET `/api/admin/students/[studentId]`
Guard: `requireAdminOf(studentId)`.
```ts
{
  student: { id: string; displayName: string; timezone: string }
  toReview: { submissionId: string; lessonId: string; lessonTitle: string; courseTitle: string; submittedAt: string }[] // oldest first
  courses: (CourseProgress & {
    lessons: { id: string; number: number; title: string; done: boolean; submission: SubmissionStatus | null }[] // Published, not deleted, course order; Draft shown as null
  })[]
}
```

### GET `/api/admin/students/[studentId]/lessons/[lessonId]`
Guard: `requireAdminLessonTarget(lessonId, studentId)`.
```ts
{
  student: { id: string; displayName: string; timezone: string }
  lesson: { id: string; title: string; courseId: string; courseTitle: string; number: number; total: number;
            assignmentPrompt: string | null; estMinutes: number }
  courseActive: boolean                // Mark done and Reopen only when true
  progress: { done: boolean; completedAt: string | null; completedByName: string | null }
  submission: { id: string; status: Exclude<SubmissionStatus, 'draft'>; bodyMd: string; attachments: Attachment[];
                submittedAt: string; reviewedAt: string | null } | null // a Draft is shown as null
  reviewComments: Comment[]
  notesCount: number
}
```
