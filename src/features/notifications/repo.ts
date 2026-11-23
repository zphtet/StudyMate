import 'server-only'
import { fail } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import type { SavePushSubscriptionInput } from './schemas'
import type { InboxItem, InboxPage } from './types'

// Devices and the inbox for every user (spec 006 US1; research R8, R9). Callers MUST have run
// `requireUser()`; every function takes the caller's id from the guard and every `where` has it.

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
