'use server'

import { action, fail } from '@/lib/action'
import {
  requireAdminLessonTarget,
  requireLessonReader,
  requireRole,
  requireSubmissionReviewer,
  requireUser,
} from '@/server/auth/guards'
import * as repo from './repo'
import {
  completeLessonSchema,
  postNoteSchema,
  reviewSubmissionSchema,
  saveDraftSchema,
  setLessonDoneSchema,
  submitAssignmentSchema,
  undoCompletionSchema,
} from './schemas'

// Spec 004 writes (specs/004-progress-assignments/contracts/server-actions.md). Each starts with its
// guards; completedBy, status and every timestamp come from the server, and a student never names
// another student.

/** US1 scenario 1–2: lesson_locked, course_not_active, submission_required (research.md R1). */
export const completeLesson = action(completeLessonSchema, async ({ lessonId }) => {
  const me = await requireRole('student')
  await requireLessonReader(lessonId)
  return repo.completeLesson(me, lessonId)
})

/** US1 scenario 3. */
export const undoCompletion = action(undoCompletionSchema, async ({ lessonId }) => {
  const me = await requireRole('student')
  await requireLessonReader(lessonId)
  return repo.undoCompletion(me, lessonId)
})

/** US1 scenario 4, FR-002: the Admin marks done or reopens; audited. */
export const setLessonDone = action(setLessonDoneSchema, async ({ studentId, lessonId, done }) => {
  const { me } = await requireAdminLessonTarget(lessonId, studentId)
  return repo.setLessonDone(me, studentId, lessonId, done)
})

/** US2 scenario 1: autosave. submission_locked, course_not_active, not_found (no prompt). */
export const saveDraft = action(saveDraftSchema, async (input) => {
  const me = await requireRole('student')
  await requireLessonReader(input.lessonId)
  return repo.saveDraft(me, input)
})

/** US2 scenarios 2 and 4; submission_empty as well. Notifies the linked Admin (FR-009). */
export const submitAssignment = action(submitAssignmentSchema, async (input) => {
  const me = await requireRole('student')
  await requireLessonReader(input.lessonId)
  return repo.submitAssignment(me, input)
})

/** US2 scenario 3: Reviewed / Needs redo with an optional comment. A Draft is submission_not_found. */
export const reviewSubmission = action(
  reviewSubmissionSchema,
  async ({ submissionId, status, comment }) => {
    const { me, submission } = await requireSubmissionReviewer(submissionId)
    return repo.reviewSubmission(me, submission, { status, comment })
  },
)

/**
 * US2 scenario 5, FR-010: a Notes post. Students write in their own thread (locks don't matter);
 * Admins name the student, whose lesson must pass requireAdminLessonTarget.
 */
export const postNote = action(postNoteSchema, async ({ lessonId, studentId, body }) => {
  const me = await requireUser()
  if (me.role === 'admin') {
    if (!studentId) fail('invalid_input')
    await requireAdminLessonTarget(lessonId, studentId)
    return repo.postNote(me, { lessonId, studentId, body })
  }
  if (studentId && studentId !== me.id) fail('forbidden')
  await requireLessonReader(lessonId)
  return repo.postNote(me, { lessonId, studentId: me.id, body })
})
