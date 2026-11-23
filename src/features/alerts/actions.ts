'use server'

import { action } from '@/lib/action'
import { requireAdminOf, requireRole } from '@/server/auth/guards'
import { webPushSender } from '@/server/notifications/push'
import * as repo from './repo'
import { ruleIdSchema, saveRuleSchema, sendTestPushSchema, setRuleEnabledSchema } from './schemas'

// Spec 006 writes for the Admin's rules (contracts/server-actions.md › Rules). Each starts with
// `requireRole('admin')`, or `requireAdminOf` when a student is named (it checks the role too). The
// Admin's id always comes from the guard.

/** The guard for a rule that applies to one student, or to All students (null). */
const adminFor = (studentId: string | null) =>
  studentId ? requireAdminOf(studentId) : requireRole('admin')

/** Create or edit a rule (US2 scenarios 1, 2). rule_not_found. */
export const saveRule = action(saveRuleSchema, async (input) =>
  repo.saveRule((await adminFor(input.studentId)).id, input),
)

/** The switch on a rule row (US2 scenario 4). rule_not_found. */
export const setRuleEnabled = action(setRuleEnabledSchema, async (input) =>
  repo.setRuleEnabled((await requireRole('admin')).id, input),
)

export const deleteRule = action(ruleIdSchema, async (input) =>
  repo.deleteRule((await requireRole('admin')).id, input),
)

/** "Send test to my phone" (US2 scenario 5). push_no_device, push_quiet_now. */
export const sendTestPush = action(sendTestPushSchema, async (input) => {
  const me = await adminFor(input.studentId)
  return repo.sendTestPush(me, input, { sender: webPushSender, now: new Date() })
})
