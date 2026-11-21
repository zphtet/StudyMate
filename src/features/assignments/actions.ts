'use server'

import { action } from '@/lib/action'
import {
  requireAdminOfAll,
  requireAssignmentOwner,
  requireCourseOwner,
  requireLessonDeadlineTarget,
} from '@/server/auth/guards'
import * as repo from './repo'
import { saveAssignmentsSchema, setCourseDeadlineSchema, setLessonDeadlineSchema } from './schemas'

// Assignment and deadline writes (specs/003-assign-deadlines/contracts/server-actions.md). Each
// starts with its guards; assignedBy, setBy and status always come from the server.

/** The whole Assign sheet (US1): every row's student must be linked to the caller. */
export const saveAssignments = action(saveAssignmentsSchema, async (input) => {
  const me = await requireCourseOwner(input.courseId)
  await requireAdminOfAll(input.rows.map((r) => r.studentId))
  return repo.saveAssignments(me, input)
})

/** One student's course deadline (US2); null removes it. Past values are allowed. */
export const setCourseDeadline = action(setCourseDeadlineSchema, async (input) => {
  const { me } = await requireAssignmentOwner(input.courseId, input.studentId)
  return repo.setCourseDeadline(me, input)
})

/** One student's own lesson deadline (US2); null falls back to the course deadline. */
export const setLessonDeadline = action(setLessonDeadlineSchema, async (input) => {
  const { me } = await requireLessonDeadlineTarget(input.lessonId, input.studentId)
  return repo.setLessonDeadline(me, input)
})
