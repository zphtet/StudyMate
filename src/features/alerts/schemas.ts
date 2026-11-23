import { z } from 'zod'
import { messageBody, ruleConfig, ruleMessage } from '@/lib/notifications/rule-config'

// Spec 006 contracts/server-actions.md › Rules and › Messages. Shared by the rule editor, the composer
// and the actions.

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

/** When a message goes (data-model.md ScheduledMessage.mode): `at` is an instant the browser made from the chosen clock. */
export const messageWhenSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('now') }),
  z.object({ mode: z.literal('fixed'), at: z.iso.datetime({ offset: true }) }),
  z.object({ mode: z.literal('next_free') }),
])
export type MessageWhen = z.infer<typeof messageWhenSchema>

const distinct = (values: readonly unknown[]) => new Set(values).size === values.length

/** Up to 50 students (contracts/server-actions.md › Messages). */
const studentIds = z
  .array(z.uuid())
  .min(1, { error: 'recipientsEmpty' })
  .max(50)
  .refine(distinct, { error: 'recipientsEmpty' })

export const scheduleMessageSchema = z.object({
  studentIds,
  body: messageBody,
  /** A lesson every recipient can read (data-model.md ScheduledMessage.lesson_id) */
  lessonId: z.uuid().nullable().optional(),
  when: messageWhenSchema,
  /** Delivered even inside shifts and sleep (FR-003) */
  urgent: z.boolean(),
})
export type ScheduleMessageInput = z.infer<typeof scheduleMessageSchema>

export const updateMessageSchema = scheduleMessageSchema.extend({ id: z.uuid() })
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>

export const messageIdSchema = z.object({ id: z.uuid() })

/** GET /api/alerts/availability?students=<id,id>&at=<ISO> */
export const availabilityQuerySchema = z.object({
  students: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.uuid()).min(1).max(50)),
  at: z.iso.datetime({ offset: true }),
})
