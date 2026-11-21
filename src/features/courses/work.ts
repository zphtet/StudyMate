import type { StudentWork } from './types'

// One student's work on a lesson, for the delete-lesson sheet (data-model.md › Student work).
// Pure: the repo passes the student's submission and progress status for that lesson, if any.

type SubmissionStatus = 'draft' | 'submitted' | 'reviewed' | 'needs_redo'
type ProgressStatus = 'not_started' | 'in_progress' | 'done'

export function studentWork(
  submission: SubmissionStatus | null,
  progress: ProgressStatus | null,
): StudentWork {
  if (submission === 'reviewed') return 'reviewed'
  if (submission === 'submitted' || submission === 'needs_redo') return 'submitted'
  if (submission === 'draft') return 'draft_assignment'
  if (progress === 'done') return 'done'
  if (progress === 'in_progress') return 'in_progress'
  return 'not_started'
}
