import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { ruleConfigFrom, type RuleView } from '@/lib/notifications/rule-config'

// A rule row as the screens read it (contracts/route-handlers.md › Shared types). Both features'
// repos use it: Alerts (the Admin's rules) and My reminders (personal and read-only Admin rules).

/** Only the columns a RuleView needs. */
export const ruleViewSelect = {
  id: true,
  studentId: true,
  trigger: true,
  config: true,
  message: true,
  channels: true,
  enabled: true,
  owner: { select: { id: true, displayName: true } },
} satisfies Prisma.NotificationRuleSelect

type RuleRow = Prisma.NotificationRuleGetPayload<{ select: typeof ruleViewSelect }>

/**
 * data-model.md NotificationRule.channels: `push` and `copy` become two switches; the inbox always
 * gets every item, so there is no in-app switch (FR-001). NotificationRule.config `preset: 'default'`
 * marks 003's default set.
 */
export function toRuleView({ channels, config, ...row }: RuleRow): RuleView {
  const parsed = ruleConfigFrom(row.trigger, config)
  return {
    ...row,
    config: parsed,
    push: channels.includes('push'),
    copyMe: channels.includes('copy'),
    isDefault: parsed.preset === 'default',
  }
}
