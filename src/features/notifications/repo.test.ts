// @vitest-environment node
// Spec 006 against the dev database. US1 (T019): devices and the inbox (research R8, R9;
// data-model.md PushSubscription.endpoint, Notification.delivered_at, Notification.read_at). The
// guards run in the actions; here every function takes the caller's id. Fixtures are deleted
// afterwards (rows cascade with their users).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import {
  deletePushSubscription,
  listInbox,
  markAllRead,
  markRead,
  savePushSubscription,
  unreadCount,
} from './repo'

vi.setConfig({ testTimeout: 60_000 })

const run = Date.now()
const may = { id: randomUUID() }
const ken = { id: randomUUID() }
const users = [may.id, ken.id]

beforeAll(async () => {
  for (const [id, name] of [
    [may.id, 'May'],
    [ken.id, 'Ken'],
  ]) {
    const meta = JSON.stringify({ role: 'student', display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${id}::uuid, ${`notifications-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  }
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const keys = { p256dh: 'p256dh-key', auth: 'auth-key' }
const endpoint = () => `https://push.example.test/${randomUUID()}`

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ActionFailure)
  await expect(promise).rejects.toMatchObject({ code })
}

describe('devices', () => {
  test('saving a device stores it for the caller, and saving it again updates it', async () => {
    const url = endpoint()
    await savePushSubscription(may.id, { endpoint: url, keys, deviceLabel: 'Pixel' })
    await savePushSubscription(may.id, { endpoint: url, keys: { ...keys, auth: 'new-auth' } })
    const rows = await prisma.pushSubscription.findMany({ where: { endpoint: url } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: may.id, auth: 'new-auth' })
  })

  test('a device another user had moves to the caller (a handed-over phone)', async () => {
    const url = endpoint()
    await savePushSubscription(ken.id, { endpoint: url, keys })
    await savePushSubscription(may.id, { endpoint: url, keys })
    const rows = await prisma.pushSubscription.findMany({ where: { endpoint: url } })
    expect(rows.map((r) => r.userId)).toEqual([may.id])
  })

  test('deleting (turning off, signing out) removes only the caller’s device', async () => {
    const url = endpoint()
    await savePushSubscription(ken.id, { endpoint: url, keys })
    await deletePushSubscription(may.id, url)
    expect(await prisma.pushSubscription.count({ where: { endpoint: url } })).toBe(1)
    await deletePushSubscription(ken.id, url)
    expect(await prisma.pushSubscription.count({ where: { endpoint: url } })).toBe(0)
  })
})

describe('inbox', () => {
  const ids: string[] = []
  const base = Date.UTC(2026, 10, 1)

  beforeAll(async () => {
    // 35 delivered rows for May, one minute apart, plus a pending row and one of Ken's.
    for (let i = 0; i < 35; i++) {
      const row = await prisma.notification.create({
        data: {
          userId: may.id,
          sourceType: 'system',
          sourceId: randomUUID(),
          occurrenceKey: `inbox-${i}`,
          title: `Item ${i}`,
          body: 'Body',
          url: i === 0 ? null : `/s/lessons/${i}`,
          deliverAt: new Date(base + i * 60_000),
          deliveredAt: new Date(base + i * 60_000),
          readAt: i < 5 ? new Date(base + i * 60_000) : null,
        },
      })
      ids.push(row.id)
    }
    await prisma.notification.createMany({
      data: [
        {
          userId: may.id,
          sourceType: 'system',
          occurrenceKey: 'pending',
          title: 'Pending',
          body: 'Not delivered yet',
          deliverAt: new Date(base + 3_600_000),
        },
        {
          userId: ken.id,
          sourceType: 'system',
          occurrenceKey: 'kens',
          title: 'Ken’s',
          body: 'Not May’s',
          deliverAt: new Date(base),
          deliveredAt: new Date(base),
        },
      ],
    })
  })

  test('lists delivered rows only, newest first, 30 per page', async () => {
    const first = await listInbox(may.id, null)
    expect(first.items).toHaveLength(30)
    expect(first.items[0]).toEqual({
      id: ids[34],
      title: 'Item 34',
      body: 'Body',
      url: '/s/lessons/34',
      deliveredAt: new Date(base + 34 * 60_000).toISOString(),
      read: false,
    })
    expect(first.items.map((i) => i.title)).not.toContain('Pending')
    expect(first.nextCursor).not.toBeNull()

    const second = await listInbox(may.id, first.nextCursor)
    expect(second.items.map((i) => i.title)).toEqual([
      'Item 4',
      'Item 3',
      'Item 2',
      'Item 1',
      'Item 0',
    ])
    expect(second.items[4]).toMatchObject({ url: null, read: true })
    expect(second.nextCursor).toBeNull()
  })

  test('counts delivered unread rows only', async () => {
    expect(await unreadCount(may.id)).toBe(30)
    expect(await unreadCount(ken.id)).toBe(1)
  })

  test('marking read works once and returns the new count', async () => {
    expect(await markRead(may.id, ids[34])).toEqual({ unread: 29 })
    expect(await markRead(may.id, ids[34])).toEqual({ unread: 29 })
  })

  test('another user’s row, or a row not delivered yet, is notification_not_found', async () => {
    const [kens, pendingRow] = await Promise.all([
      prisma.notification.findFirstOrThrow({ where: { userId: ken.id } }),
      prisma.notification.findFirstOrThrow({ where: { userId: may.id, deliveredAt: null } }),
    ])
    await expectCode(markRead(may.id, kens.id), 'notification_not_found')
    await expectCode(markRead(may.id, pendingRow.id), 'notification_not_found')
    await expectCode(markRead(may.id, randomUUID()), 'notification_not_found')
  })

  test('mark all read clears the caller’s delivered rows and nobody else’s', async () => {
    expect(await markAllRead(may.id)).toEqual({ unread: 0 })
    expect(await unreadCount(may.id)).toBe(0)
    expect(await unreadCount(ken.id)).toBe(1)
    const pendingRow = await prisma.notification.findFirstOrThrow({
      where: { userId: may.id, deliveredAt: null },
    })
    expect(pendingRow.readAt).toBeNull()
  })
})
