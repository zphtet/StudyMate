import 'server-only'
import { fail } from '@/lib/action'
import { storedRule, type RuleView } from '@/lib/notifications/rule-config'
import { prisma } from '@/lib/prisma'
import { fromClock, toClock } from '@/lib/time'
import { ruleViewSelect, toRuleView } from '@/server/notifications/rule-view'
import type {
  SavePersonalReminderInput,
  SavePushSubscriptionInput,
  SaveQuietHoursInput,
} from './schemas'
import type { InboxItem, InboxPage, MyReminders } from './types'

// Devices, the inbox, quiet hours and personal reminders (spec 006 US1, US5; research R8–R10, R14).
// Callers MUST have run their guard (`requireUser()`, or `requireRole('student')` for personal
// reminders); every function takes the caller's id from the guard and every `where` has it.

/** The inbox shows this many items per page (R9). */
const PAGE_SIZE = 30

/**
 * Turn reminders on for this device (data-model.md PushSubscription.endpoint, unique). Saving an
 * endpoint another user had moves it to the caller, so a handed-over phone never gets the previous
 * user's notifications (R8).
 */
export async function savePushSubscription(
  userId: string,
  { endpoint, keys, deviceLabel }: SavePushSubscriptionInput,
) {
  const device = {
    userId,
    p256dh: keys.p256dh,
    auth: keys.auth,
    deviceLabel,
    lastSeenAt: new Date(),
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...device },
    update: device,
  })
}

/** Turn reminders off for this device, or sign out on it (FR-014). Only the caller's row. */
export async function deletePushSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } })
}

const delivered = { deliveredAt: { not: null } } as const

/**
 * Delivered items, newest first (data-model.md Notification.delivered_at: a pending row isn't in the
 * inbox yet). `cursor` is the last item's id from the previous page.
 */
export async function listInbox(userId: string, cursor: string | null): Promise<InboxPage> {
  const rows = await prisma.notification.findMany({
    where: { userId, ...delivered },
    orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: { id: true, title: true, body: true, url: true, deliveredAt: true, readAt: true },
  })
  const items = rows
    .slice(0, PAGE_SIZE)
    .flatMap(({ deliveredAt, readAt, ...row }): InboxItem[] =>
      deliveredAt
        ? [{ ...row, deliveredAt: deliveredAt.toISOString(), read: readAt !== null }]
        : [],
    )
  return { items, nextCursor: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null }
}

/** The bell's count: delivered, unread items. */
export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, ...delivered, readAt: null } })
}

/**
 * An item opened from the inbox or its phone notification (FR-007; data-model.md
 * Notification.read_at). Idempotent; a row of someone else's or not delivered yet is
 * `notification_not_found`.
 */
export async function markRead(userId: string, id: string) {
  const exists = await prisma.notification.count({ where: { id, userId, ...delivered } })
  if (exists === 0) fail('notification_not_found')
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  })
  return { unread: await unreadCount(userId) }
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, ...delivered, readAt: null },
    data: { readAt: new Date() },
  })
  return { unread: 0 as const }
}

/**
 * Quiet hours (FR-013; data-model.md Profile.quiet_start, Profile.quiet_end): a daily window, which
 * may cross midnight, or none. The schema keeps both set or both null.
 */
export async function saveQuietHours(userId: string, { start, end }: SaveQuietHoursInput) {
  await prisma.profile.update({
    where: { id: userId },
    data: {
      quietStart: start === null ? null : fromClock(start),
      quietEnd: end === null ? null : fromClock(end),
    },
  })
  return { quietStart: start, quietEnd: end }
}

/**
 * A personal reminder: the student's own daily-time rule (research R10; data-model.md
 * NotificationRule.owner_id = NotificationRule.student_id = the student, NotificationRule.trigger
 * `daily` only). Another student's reminder or an Admin's rule never matches.
 */
const personalOf = (studentId: string) =>
  ({ ownerId: studentId, studentId, trigger: 'daily' }) as const

/** Reminders made by the rule that are still waiting for their recipient. */
const pendingOf = (ruleId: string) => ({ sourceType: 'rule', sourceId: ruleId, deliveredAt: null })

/**
 * Add or change the caller's own reminder. Push only (data-model.md NotificationRule.channels): there
 * is no Admin to copy. Turning it off drops what it still has waiting, as for an Admin's rule
 * (US2 scenario 4; data-model.md NotificationRule.enabled).
 */
export async function savePersonalReminder(
  studentId: string,
  { id, message, time, days, enabled }: SavePersonalReminderInput,
): Promise<{ rule: RuleView }> {
  const data = {
    message,
    enabled,
    channels: ['push'],
    ...storedRule({ trigger: 'daily', time, days }),
  }
  if (!id) {
    const rule = await prisma.notificationRule.create({
      data: { ownerId: studentId, studentId, ...data },
      select: ruleViewSelect,
    })
    return { rule: toRuleView(rule) }
  }

  const { count } = await prisma.notificationRule.updateMany({
    where: { id, ...personalOf(studentId) },
    data,
  })
  if (count === 0) fail('rule_not_found')
  if (!enabled) await prisma.notification.deleteMany({ where: pendingOf(id) })
  const rule = await prisma.notificationRule.findUniqueOrThrow({
    where: { id },
    select: ruleViewSelect,
  })
  return { rule: toRuleView(rule) }
}

/** Delete the caller's own reminder and what it still has waiting. */
export async function deletePersonalReminder(studentId: string, { id }: { id: string }) {
  const { count } = await prisma.notificationRule.deleteMany({
    where: { id, ...personalOf(studentId) },
  })
  if (count === 0) fail('rule_not_found')
  await prisma.notification.deleteMany({ where: pendingOf(id) })
  return { id }
}

/**
 * An Admin's rule reaches the student unless it only alerts the Admin (Inactive or Weekly summary
 * sent to the Admin alone).
 */
function reachesStudent({ config }: RuleView) {
  return !('to' in config) || config.to.includes('student')
}

/**
 * My reminders (US5; contracts/route-handlers.md › GET /api/me/reminders). Students: their own
 * reminders, and the enabled rules of their active Admin for them or for All students (FR-016,
 * FR-020), read-only. Admins: quiet hours only.
 */
export async function getMyReminders(me: {
  id: string
  role: 'student' | 'admin'
}): Promise<MyReminders> {
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: me.id },
    select: { quietStart: true, quietEnd: true },
  })
  const quietHours =
    profile.quietStart && profile.quietEnd
      ? { start: toClock(profile.quietStart), end: toClock(profile.quietEnd) }
      : null
  if (me.role !== 'student') return { quietHours, personal: [], fromAdmin: [] }

  const link = await prisma.studentLink.findFirst({
    where: { studentId: me.id, status: 'active' },
    select: { adminId: true },
  })
  const [personal, fromAdmin] = await Promise.all([
    prisma.notificationRule.findMany({
      where: personalOf(me.id),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ruleViewSelect,
    }),
    link
      ? prisma.notificationRule.findMany({
          where: {
            ownerId: link.adminId,
            enabled: true,
            OR: [{ studentId: me.id }, { studentId: null }],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: ruleViewSelect,
        })
      : [],
  ])
  return {
    quietHours,
    personal: personal.map(toRuleView),
    fromAdmin: fromAdmin.map(toRuleView).filter(reachesStudent),
  }
}
