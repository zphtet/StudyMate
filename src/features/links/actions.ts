'use server'

import { action } from '@/lib/action'
import { requireRole, requireUser } from '@/server/auth/guards'
import * as repo from './repo'
import {
  dismissNoticeSchema,
  noInputSchema,
  requestJoinSchema,
  respondToRequestSchema,
} from './schemas'

// Joining an admin (spec 001 User Story 2; contracts/server-actions.md › links). Guard first; the
// caller's id comes from the guard and scopes every write in the repo.

export const requestJoin = action(requestJoinSchema, async ({ code }) => {
  const me = await requireRole('student')
  return repo.requestJoin(me.id, code)
})

export const respondToRequest = action(respondToRequestSchema, async ({ linkId, approve }) => {
  const me = await requireRole('admin')
  return repo.respondToRequest(me.id, linkId, approve)
})

export const leaveAdmin = action(noInputSchema, async () => {
  const me = await requireRole('student')
  await repo.leaveAdmin(me.id)
  return {}
})

export const dismissNotice = action(dismissNoticeSchema, async ({ id }) => {
  const me = await requireUser()
  await repo.dismissNotice(me.id, id)
  return {}
})
