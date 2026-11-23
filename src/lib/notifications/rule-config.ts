import { z } from 'zod'
import { RuleTrigger } from '@/generated/prisma/enums'

// Rule and message fields (spec 006 contracts/server-actions.md › Field schemas; data-model.md
// NotificationRule.trigger, NotificationRule.config, NotificationRule.message, ScheduledMessage.body).
// Shared by the rule editor, My reminders, both features' actions and repos, and the dispatcher, so
// it lives here rather than in a feature. Messages are `validation.*` keys; rules the editors can't
// break (a weekday of 8, half-hour steps) keep Zod's default message.

/** A local clock time `HH:mm`, in the student's zone for rules. */
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'timeInvalid' })

/** An ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekday = z.int().min(1).max(7)

const distinct = (values: readonly unknown[]) => new Set(values).size === values.length

/** A daily rule's or personal reminder's days: at least one, each once. */
export const ruleDays = z
  .array(weekday)
  .min(1, { error: 'daysEmpty' })
  .max(7)
  .refine(distinct, { error: 'daysEmpty' })

const offsets = z
  .array(
    z
      .int({ error: 'offsetsInvalid' })
      .min(1, { error: 'offsetsInvalid' })
      .max(72, { error: 'offsetsInvalid' }),
  )
  .min(1, { error: 'offsetsInvalid' })
  .max(3, { error: 'offsetsInvalid' })
  .refine(distinct, { error: 'offsetsInvalid' })

/** Who gets an Inactive alert or a Weekly summary. */
const recipients = z
  .array(z.enum(['student', 'admin']))
  .min(1)
  .max(2)
  .refine(distinct)

/** `preset: 'default'` marks 003's default set (notification_rules_default_once). */
const preset = { preset: z.literal('default').optional() }

/** data-model.md › Config by trigger. `max` counts every overdue reminder, the one at the deadline included. */
export const ruleConfig = z.discriminatedUnion('trigger', [
  z.object({ trigger: z.literal(RuleTrigger.daily), ...preset, time: clockTime, days: ruleDays }),
  z.object({
    trigger: z.literal(RuleTrigger.after_shift),
    ...preset,
    hours: z.number().min(0.5).max(12).multipleOf(0.5),
  }),
  z.object({ trigger: z.literal(RuleTrigger.due_soon), ...preset, offsets_h: offsets }),
  z.object({
    trigger: z.literal(RuleTrigger.overdue),
    ...preset,
    repeat_time: clockTime,
    max: z.int().min(1).max(7),
  }),
  z.object({ trigger: z.literal(RuleTrigger.streak_risk), ...preset, time: clockTime }),
  z.object({
    trigger: z.literal(RuleTrigger.inactive),
    ...preset,
    days: z.int().min(1).max(14),
    to: recipients,
  }),
  z.object({
    trigger: z.literal(RuleTrigger.weekly_summary),
    ...preset,
    weekday,
    time: clockTime,
    to: recipients,
  }),
])
export type RuleConfig = z.infer<typeof ruleConfig>

/** data-model.md NotificationRule.message: 1–500 characters after trimming. */
export const ruleMessage = z
  .string()
  .trim()
  .min(1, { error: 'messageEmpty' })
  .max(500, { error: 'messageTooLong' })

/** data-model.md ScheduledMessage.body: 1–1000 characters after trimming. */
export const messageBody = z
  .string()
  .trim()
  .min(1, { error: 'messageEmpty' })
  .max(1000, { error: 'messageTooLong' })

/** The columns a config is stored in: `trigger`, and the rest as `config` jsonb. */
export function storedRule({ trigger, ...config }: RuleConfig) {
  return { trigger, config }
}

/** A stored rule's config, checked against its trigger. Throws when the row no longer fits. */
export function ruleConfigFrom(trigger: RuleTrigger, config: unknown): RuleConfig {
  return ruleConfig.parse({ ...z.record(z.string(), z.unknown()).parse(config), trigger })
}

/**
 * The default set (spec 006 FR-008): what 003's "Add default reminders" creates (003 FR-013). One
 * source for both features.
 */
export const DEFAULT_RULE_SET = [
  { trigger: 'daily', preset: 'default', time: '20:00', days: [1, 2, 3, 4, 5] },
  { trigger: 'due_soon', preset: 'default', offsets_h: [24, 2] },
  { trigger: 'overdue', preset: 'default', repeat_time: '19:00', max: 3 },
  { trigger: 'streak_risk', preset: 'default', time: '21:30' },
] as const satisfies readonly RuleConfig[]

/** A rule as the screens read it (contracts/route-handlers.md › Shared types). */
export type RuleView = {
  id: string
  /** null = all the owner's linked students (FR-020) */
  studentId: string | null
  trigger: RuleTrigger
  config: RuleConfig
  message: string
  /** channel `push` (data-model.md NotificationRule.channels) */
  push: boolean
  /** channel `copy`: a copy in the owner's inbox (FR-018) */
  copyMe: boolean
  enabled: boolean
  /** 003's default set */
  isDefault: boolean
  owner: { id: string; displayName: string }
}
