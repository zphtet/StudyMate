import type { SubmissionStatus } from '@/generated/prisma/client'

// What stops a lesson from being completed (spec 004 US1 scenarios 1–2, FR-002, FR-004; research.md
// R1). Pure, so the student action, the Admin action and the tests share one rule.

export type CompletionBlock = 'lesson_locked' | 'course_not_active' | 'submission_required'

export function completionBlock({
  role,
  locked,
  courseActive,
  requireSubmission,
  submissionStatus,
}: {
  role: 'student' | 'admin'
  locked: boolean
  /** Archived courses are read-only (002). */
  courseActive: boolean
  requireSubmission: boolean
  submissionStatus: SubmissionStatus | null
}): CompletionBlock | null {
  if (!courseActive) return 'course_not_active'
  // The Admin marks done on the student's behalf (FR-002): locks and "submit before complete" are
  // the student's pacing, and the Admin decides.
  if (role === 'admin') return null
  if (locked) return 'lesson_locked'
  // Any non-Draft submission counts; a review never undoes completion (FR-004).
  if (requireSubmission && (submissionStatus === null || submissionStatus === 'draft')) {
    return 'submission_required'
  }
  return null
}
