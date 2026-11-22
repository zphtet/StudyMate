import type { SubmissionStatus } from '@/generated/prisma/client'

// Who may move a submission from which status to which (spec 004 FR-004, research.md R7,
// data-model.md Submission.status). The Server Actions use this table; the RLS policies in the
// 004 migration (subs_student_*, subs_admin_review) enforce the same moves.
//
// | Who     | From                        | To                      |
// | Student | none, draft, needs_redo     | same (save) / submitted |
// | Admin   | submitted, reviewed, redo   | reviewed / needs_redo   |

const STUDENT_EDITABLE: readonly (SubmissionStatus | null)[] = [null, 'draft', 'needs_redo']
const REVIEWABLE: readonly SubmissionStatus[] = ['submitted', 'reviewed', 'needs_redo']
const REVIEW_RESULTS: readonly SubmissionStatus[] = ['reviewed', 'needs_redo']

/** Draft and Needs redo are the student's to edit; Submitted and Reviewed are read-only. */
export const canStudentEdit = (status: SubmissionStatus | null) => STUDENT_EDITABLE.includes(status)

/** The status after the student saves or submits, or null when the move isn't allowed. */
export function studentNext(
  status: SubmissionStatus | null,
  action: 'save' | 'submit',
): SubmissionStatus | null {
  if (!canStudentEdit(status)) return null
  if (action === 'submit') return 'submitted'
  return status ?? 'draft'
}

/** The Admin never sees a Draft, and may change a review until the student resubmits. */
export const adminCanReview = (from: SubmissionStatus, to: SubmissionStatus) =>
  REVIEWABLE.includes(from) && REVIEW_RESULTS.includes(to)
