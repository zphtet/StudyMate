'use server'

import { action } from '@/lib/action'
import { requireAdminOfAll, requireCourseOwner } from '@/server/auth/guards'
import * as repo from './repo'
import { saveAssignmentsSchema } from './schemas'

// Assignment and deadline writes (specs/003-assign-deadlines/contracts/server-actions.md). Each
// starts with its guards; assignedBy, setBy and status always come from the server.

/** The whole Assign sheet (US1): every row's student must be linked to the caller. */
export const saveAssignments = action(saveAssignmentsSchema, async (input) => {
  const me = await requireCourseOwner(input.courseId)
  await requireAdminOfAll(input.rows.map((r) => r.studentId))
  return repo.saveAssignments(me, input)
})
