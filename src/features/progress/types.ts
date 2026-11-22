import type { SubmissionStatus } from '@/generated/prisma/client'

// Response shapes of the 004 Route Handlers (specs/004-progress-assignments/contracts/
// route-handlers.md). Instants are ISO 8601 UTC strings, calendar dates YYYY-MM-DD in the student's
// zone, durations whole seconds. Input types come from schemas.ts (z.infer).

export type { SubmissionStatus }

/** A stored submission image; `url` is the access-checked /api/submissions/<id>/files/<basename>. */
export type AttachmentView = { path: string; name: string; size: number; url: string }

export type CommentView = {
  id: string
  authorId: string
  authorName: string
  isMine: boolean
  body: string
  createdAt: string
}

export type Streak = { current: number; best: number }

/** research.md R6. `empty` = 0 published lessons ("—"). */
export type Forecast =
  | { kind: 'finished' }
  | { kind: 'empty' }
  | { kind: 'no_pace'; remaining: number }
  | { kind: 'no_deadline'; remaining: number; finishOn: string | null }
  | { kind: 'on_track' | 'behind'; finishOn: string; dueOn: string }

/** `percent` null = no published lessons (course_progress, spec FR-005). `color` is Course.color. */
export type CourseProgress = {
  courseId: string
  title: string
  color: string
  percent: number | null
  done: number
  total: number
}
