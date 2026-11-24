'use server'

import { z } from 'zod'
import { action } from '@/lib/action'
import { inviteUrl } from '@/lib/invite-url'
import { requireRole } from '@/server/auth/guards'
import { regenerateInviteCode as regenerate } from './repo'

// contracts/server-actions.md › regenerateInviteCode (FR-003).
export const regenerateInviteCode = action(z.object({}), async () => {
  const me = await requireRole('admin')
  const { code } = await regenerate(me.id)
  return { code, url: inviteUrl(code) }
})
