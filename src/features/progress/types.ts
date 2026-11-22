import type { CourseColor } from '@/features/courses/schemas'
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

/** `percent` null = no published lessons (course_progress, spec FR-005). */
export type CourseProgress = {
  courseId: string
  title: string
  color: CourseColor
  percent: number | null
  done: number
  total: number
}

export type SubmissionView = {
  id: string
  status: SubmissionStatus
  bodyMd: string
  attachments: AttachmentView[]
  submittedAt: string | null
  reviewedAt: string | null
}

/** GET /api/lessons/[lessonId]/work. `completedByName` only when someone else marked it done. */
export type LessonWork = {
  progress: {
    done: boolean
    completedAt: string | null
    completedByName: string | null
    /** Completion credit plus counted focus time, whole minutes. */
    minutes: number
  }
  submission: SubmissionView | null
  reviewComments: CommentView[]
  notesCount: number
  nextLessonId: string | null
}

export type StudentRef = { id: string; displayName: string; timezone: string }

/** GET /api/admin/students/progress. US2 adds `toReview`; US3 the streak, week and overdue tiles. */
export type AdminStudentCard = StudentRef & { courses: CourseProgress[] }

/** GET /api/admin/students/[studentId]. `submission` is null for none or a Draft. */
export type AdminStudentDetail = {
  student: StudentRef
  toReview: {
    submissionId: string
    lessonId: string
    lessonTitle: string
    courseTitle: string
    submittedAt: string
  }[]
  courses: (CourseProgress & {
    lessons: {
      id: string
      number: number
      title: string
      done: boolean
      submission: SubmissionStatus | null
    }[]
  })[]
}

/** GET /api/admin/students/[studentId]/lessons/[lessonId]. A Draft submission is shown as null. */
export type AdminLessonReview = {
  student: StudentRef
  lesson: {
    id: string
    title: string
    courseId: string
    courseTitle: string
    number: number
    total: number
    assignmentPrompt: string | null
    estMinutes: number
  }
  /** Mark done and Reopen only when true. */
  courseActive: boolean
  progress: { done: boolean; completedAt: string | null; completedByName: string | null }
  submission: (SubmissionView & { status: Exclude<SubmissionStatus, 'draft'> }) | null
  reviewComments: CommentView[]
  notesCount: number
}
