import { z } from 'zod'
import { ruleConfig, ruleMessage } from '@/lib/notifications/rule-config'

// Spec 006 contracts/server-actions.md › Rules. Shared by the rule editor and the actions.

/** null = all the Admin's students (FR-020) */
const appliesTo = z.uuid().nullable()

export const saveRuleSchema = z.object({
  id: z.uuid().optional(),
  studentId: appliesTo,
  config: ruleConfig,
  message: ruleMessage,
  /** channel `push` */
  push: z.boolean(),
  /** channel `copy` (FR-018) */
  copyMe: z.boolean(),
})
export type SaveRuleInput = z.infer<typeof saveRuleSchema>
export type SaveRuleFormInput = z.input<typeof saveRuleSchema>

export const setRuleEnabledSchema = z.object({ id: z.uuid(), enabled: z.boolean() })

export const ruleIdSchema = z.object({ id: z.uuid() })

/** "Send test to my phone" (US2 scenario 5): the rule as it is in the editor, saved or not. */
export const sendTestPushSchema = z.object({
  config: ruleConfig,
  message: ruleMessage,
  studentId: appliesTo,
})
export type SendTestPushInput = z.infer<typeof sendTestPushSchema>

/** GET /api/alerts?student= : a student's id, or `all` */
export const alertsStudentSchema = z.union([z.literal('all'), z.uuid()])
