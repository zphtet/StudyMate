import 'server-only'
import { fail } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { renderMessage } from '@/lib/notifications/render'
import { storedRule, type RuleConfig } from '@/lib/notifications/rule-config'
import { prisma } from '@/lib/prisma'
import type { PushSender } from '@/server/notifications/push'
import { ruleTitle } from '@/server/notifications/rule-rows'
import { ruleViewSelect, toRuleView } from '@/server/notifications/rule-view'
import { textsFor } from '@/server/notifications/texts'
import type { SaveRuleInput, SendTestPushInput } from './schemas'
import type { AlertsData, RuleData } from './types'

// The Admin's automatic rules (spec 006 US2; contracts/server-actions.md › Rules). Callers MUST have
// run `requireRole('admin')`, and `requireAdminOf` for a named student; every `where` has
// `ownerId: adminId` (data-model.md › Guards).

/**
 * The chips (the caller's linked students) and the caller's rules, in trigger order: for one student,
 * theirs and the All students ones; for `null` (All students), every rule of a linked student or for
 * all of them.
 */
export async function getAlerts(adminId: string, studentId: string | null): Promise<AlertsData> {
  const linked = { linksAsStudent: { some: { adminId, status: 'active' as const } } }
  const [links, rules] = await Promise.all([
    prisma.studentLink.findMany({
      where: { adminId, status: 'active' },
      orderBy: { student: { displayName: 'asc' } },
      select: { student: { select: { id: true, displayName: true, timezone: true } } },
    }),
    prisma.notificationRule.findMany({
      where: {
        ownerId: adminId,
        OR: [{ studentId: null }, studentId ? { studentId } : { student: linked }],
      },
      orderBy: [{ trigger: 'asc' }, { createdAt: 'asc' }],
      select: ruleViewSelect,
    }),
  ])
  return { students: links.map((link) => link.student), rules: rules.map(toRuleView) }
}

export async function getRule(adminId: string, id: string): Promise<RuleData> {
  const rule = await prisma.notificationRule.findFirst({
    where: { id, ownerId: adminId },
    select: ruleViewSelect,
  })
  if (!rule) throw new NotFound('rule_not_found')
  return { rule: toRuleView(rule) }
}

/** data-model.md NotificationRule.channels: the inbox always gets it, so only push and copy. */
const channelsOf = ({ push, copyMe }: { push: boolean; copyMe: boolean }) => [
  ...(push ? ['push'] : []),
  ...(copyMe ? ['copy'] : []),
]

/** Only an edited default rule keeps 003's mark (below); the form can't set it. */
const withPreset = (config: RuleConfig, isDefault: boolean): RuleConfig => ({
  ...config,
  preset: isDefault ? 'default' : undefined,
})

/**
 * Create, or edit the caller's rule (`rule_not_found` otherwise). A new rule is on. An edited default
 * rule keeps `preset: 'default'` while its trigger and student stay the same, so 003's "Add default
 * reminders" doesn't create it again (notification_rules_default_once).
 */
export async function saveRule(adminId: string, input: SaveRuleInput): Promise<RuleData> {
  const fields = {
    studentId: input.studentId,
    message: input.message,
    channels: channelsOf(input),
  }
  const { config } = input

  if (!input.id) {
    const rule = await prisma.notificationRule.create({
      data: { ownerId: adminId, ...fields, ...storedRule(withPreset(config, false)) },
      select: ruleViewSelect,
    })
    return { rule: toRuleView(rule) }
  }

  const existing = await prisma.notificationRule.findFirst({
    where: { id: input.id, ownerId: adminId },
    select: ruleViewSelect,
  })
  if (!existing) fail('rule_not_found')
  const before = toRuleView(existing)
  const keepsDefault =
    before.isDefault && before.trigger === config.trigger && before.studentId === input.studentId
  const rule = await prisma.notificationRule.update({
    where: { id: input.id, ownerId: adminId },
    data: { ...fields, ...storedRule(withPreset(config, keepsDefault)) },
    select: ruleViewSelect,
  })
  return { rule: toRuleView(rule) }
}

/** Reminders made by the rule that are still waiting for their recipient. */
const pendingOf = (ruleId: string) => ({
  sourceType: 'rule',
  sourceId: ruleId,
  deliveredAt: null,
})

/**
 * On or off (data-model.md NotificationRule.enabled). Off also drops its reminders that are still
 * waiting; turning it on never sends what was missed (US2 scenario 4).
 */
export async function setRuleEnabled(
  adminId: string,
  { id, enabled }: { id: string; enabled: boolean },
) {
  const { count } = await prisma.notificationRule.updateMany({
    where: { id, ownerId: adminId },
    data: { enabled },
  })
  if (count === 0) fail('rule_not_found')
  if (!enabled) await prisma.notification.deleteMany({ where: pendingOf(id) })
  return { enabled }
}

/** Delete the caller's rule and its reminders that are still waiting. */
export async function deleteRule(adminId: string, { id }: { id: string }) {
  const { count } = await prisma.notificationRule.deleteMany({ where: { id, ownerId: adminId } })
  if (count === 0) fail('rule_not_found')
  await prisma.notification.deleteMany({ where: pendingOf(id) })
  return { id }
}

type Caller = { id: string; locale: string; timezone: string }

/**
 * "Send test to my phone" (US2 scenario 5): the rule rendered with sample values (the student's name,
 * a sample lesson, a deadline tomorrow in the student's zone), pushed to the caller's own devices
 * only, with no inbox row. Never while the caller is busy (`next_free_at(me, now) > now`: quiet
 * hours or outside waking hours; constitution IV).
 */
export async function sendTestPush(
  me: Caller,
  input: SendTestPushInput,
  { sender, now }: { sender: PushSender; now: Date },
) {
  const devices = await prisma.pushSubscription.findMany({
    where: { userId: me.id },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
  if (devices.length === 0) fail('push_no_device')
  const [{ free }] = await prisma.$queryRaw<{ free: Date }[]>`
    select next_free_at(${me.id}::uuid, ${now}::timestamptz) as free`
  if (free > now) fail('push_quiet_now')

  const student = input.studentId
    ? await prisma.profile.findUnique({
        where: { id: input.studentId },
        select: { displayName: true, timezone: true },
      })
    : null
  // In the Admin's language; `{due}` in the student's zone (FR-005).
  const { tr, when } = await textsFor({ ...me, timezone: student?.timezone ?? me.timezone })
  const payload = {
    title: tr('pushTexts.test', { title: ruleTitle(tr, input.config) }),
    body: renderMessage(input.message, {
      name: student?.displayName ?? tr('ruleEditor.sampleName'),
      lesson: tr('ruleEditor.sampleLesson'),
      course: tr('ruleEditor.sampleCourse'),
      due: when(new Date(now.getTime() + 24 * 3_600_000)),
    }),
    url: '/a/alerts',
    tag: 'test',
  }

  const results = await Promise.all(
    devices.map(async (device) => ({ device, result: await sender.send(device, payload) })),
  )
  const gone = results.filter((r) => r.result === 'gone').map((r) => r.device.id)
  if (gone.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } })
  return { sent: results.filter((r) => r.result === 'ok').length }
}
