'use server'

import { action } from '@/lib/action'
import { requireAdminLessonTarget, requireLessonReader, requireRole } from '@/server/auth/guards'
import * as repo from './repo'
import { completeLessonSchema, setLessonDoneSchema, undoCompletionSchema } from './schemas'

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
