// @vitest-environment node
// Spec 006 against the dev database. US1 (T019): devices and the inbox (research R8, R9;
// data-model.md PushSubscription.endpoint, Notification.delivered_at, Notification.read_at). US5
// (T072): quiet hours, personal reminders and My reminders (research R10, R14; FR-013, FR-016). The
// guards run in the actions; here every function takes the caller's id. Fixtures are deleted
// afterwards (rows cascade with their users).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import {
  deletePersonalReminder,
  deletePushSubscription,
  getMyReminders,
  listInbox,
  markAllRead,
  markRead,
  savePersonalReminder,
  savePushSubscription,
  saveQuietHours,
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

// US5 (T072): quiet hours for both roles, a student's own reminders, and the Admin's rules listed
// read-only (contracts/server-actions.md; data-model.md Profile.quiet_start, Profile.quiet_end,
// NotificationRule.owner_id, NotificationRule.student_id, NotificationRule.trigger). An Admin calling
// savePersonalReminder is refused by requireRole('student') before the repo runs: covered by
// src/server/auth/guards.test.ts › requireRole.
describe('My reminders (US5)', () => {
  async function newUser(role: 'student' | 'admin', name: string) {
    const id = randomUUID()
    users.push(id)
    const meta = JSON.stringify({ role, display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${id}::uuid, ${`notifications-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
    return { id, role }
  }

  const link = (adminId: string, studentId: string, status: 'active' | 'removed' = 'active') =>
    prisma.studentLink.create({ data: { adminId, studentId, status } })

  const adminRule = (
    ownerId: string,
    studentId: string | null,
    config: { trigger: 'daily' | 'inactive'; [key: string]: unknown },
    enabled = true,
  ) => {
    const { trigger, ...rest } = config
    return prisma.notificationRule.create({
      data: {
        ownerId,
        studentId,
        trigger,
        config: rest as never,
        message: 'Time for today’s lesson.',
        channels: ['push'],
        enabled,
      },
    })
  }

  const kanji = {
    message: 'Kanji 10 min',
    time: '12:30',
    days: [1, 2, 3, 4, 5, 6, 7],
    enabled: true,
  }

  describe('saveQuietHours', () => {
    test('sets a window for a student and for an Admin, and None clears both', async () => {
      const sue = await newUser('student', 'Sue')
      const zin = await newUser('admin', 'Zin')
      expect(await saveQuietHours(sue.id, { start: '22:00', end: '07:00' })).toEqual({
        quietStart: '22:00',
        quietEnd: '07:00',
      })
      await saveQuietHours(zin.id, { start: '12:00', end: '13:00' })
      expect((await getMyReminders(zin)).quietHours).toEqual({ start: '12:00', end: '13:00' })

      expect(await saveQuietHours(sue.id, { start: null, end: null })).toEqual({
        quietStart: null,
        quietEnd: null,
      })
      expect((await getMyReminders(sue)).quietHours).toBeNull()
    })
  })

  describe('savePersonalReminder', () => {
    test('a daily push reminder owned by and for the student', async () => {
      const sue = await newUser('student', 'Sue')
      const { rule } = await savePersonalReminder(sue.id, kanji)
      expect(rule).toMatchObject({
        studentId: sue.id,
        trigger: 'daily',
        config: { trigger: 'daily', time: '12:30', days: [1, 2, 3, 4, 5, 6, 7] },
        message: 'Kanji 10 min',
        push: true,
        copyMe: false,
        enabled: true,
        owner: { id: sue.id },
      })
      const stored = await prisma.notificationRule.findUniqueOrThrow({ where: { id: rule.id } })
      expect(stored).toMatchObject({ ownerId: sue.id, studentId: sue.id, channels: ['push'] })
    })

    test('editing changes it; turning it off drops what it still has waiting', async () => {
      const sue = await newUser('student', 'Sue')
      const { rule } = await savePersonalReminder(sue.id, kanji)
      const waiting = await prisma.notification.create({
        data: {
          userId: sue.id,
          sourceType: 'rule',
          sourceId: rule.id,
          occurrenceKey: '2027-03-03',
          title: 'Daily study reminder',
          body: 'Kanji 10 min',
          deliverAt: new Date(),
        },
      })
      const { rule: edited } = await savePersonalReminder(sue.id, {
        ...kanji,
        id: rule.id,
        time: '07:15',
        enabled: false,
      })
      expect(edited).toMatchObject({ id: rule.id, enabled: false, config: { time: '07:15' } })
      expect(await prisma.notification.findUnique({ where: { id: waiting.id } })).toBeNull()
    })

    test('another student’s reminder, or an Admin rule, is rule_not_found', async () => {
      const sue = await newUser('student', 'Sue')
      const ken2 = await newUser('student', 'Ken')
      const zin = await newUser('admin', 'Zin')
      await link(zin.id, sue.id)
      const kens = await savePersonalReminder(ken2.id, kanji)
      const zins = await adminRule(zin.id, sue.id, { trigger: 'daily', time: '20:00', days: [1] })
      await expectCode(
        savePersonalReminder(sue.id, { ...kanji, id: kens.rule.id }),
        'rule_not_found',
      )
      await expectCode(savePersonalReminder(sue.id, { ...kanji, id: zins.id }), 'rule_not_found')
    })
  })

  describe('deletePersonalReminder', () => {
    test('deletes the student’s own reminder only', async () => {
      const sue = await newUser('student', 'Sue')
      const ken2 = await newUser('student', 'Ken')
      const zin = await newUser('admin', 'Zin')
      await link(zin.id, sue.id)
      const own = await savePersonalReminder(sue.id, kanji)
      const kens = await savePersonalReminder(ken2.id, kanji)
      const zins = await adminRule(zin.id, sue.id, { trigger: 'daily', time: '20:00', days: [1] })

      expect(await deletePersonalReminder(sue.id, { id: own.rule.id })).toEqual({ id: own.rule.id })
      expect(await prisma.notificationRule.count({ where: { id: own.rule.id } })).toBe(0)
      await expectCode(deletePersonalReminder(sue.id, { id: kens.rule.id }), 'rule_not_found')
      await expectCode(deletePersonalReminder(sue.id, { id: zins.id }), 'rule_not_found')
      await expectCode(deletePersonalReminder(sue.id, { id: own.rule.id }), 'rule_not_found')
    })
  })

  describe('getMyReminders', () => {
    test('own reminders, and the active Admin’s rules for the student and for All students', async () => {
      const sue = await newUser('student', 'Sue')
      const zin = await newUser('admin', 'Zin')
      const ann = await newUser('admin', 'Ann')
      const old = await newUser('admin', 'Old')
      await link(zin.id, sue.id)
      await link(old.id, sue.id, 'removed')
      const own = await savePersonalReminder(sue.id, kanji)
      const forSue = await adminRule(zin.id, sue.id, { trigger: 'daily', time: '20:00', days: [1] })
      const forAll = await adminRule(zin.id, null, { trigger: 'daily', time: '19:00', days: [2] })
      // Not reminders Sue gets: turned off, or alerts for Zin only.
      await adminRule(zin.id, sue.id, { trigger: 'daily', time: '08:00', days: [3] }, false)
      await adminRule(zin.id, sue.id, { trigger: 'inactive', days: 2, to: ['admin'] })
      // Not Sue's Admin: another Admin's rule for All students, and an unlinked Admin's rule.
      await adminRule(ann.id, null, { trigger: 'daily', time: '20:00', days: [1] })
      await adminRule(old.id, sue.id, { trigger: 'daily', time: '20:00', days: [1] })

      const mine = await getMyReminders(sue)
      expect(mine.personal.map((r) => r.id)).toEqual([own.rule.id])
      expect(mine.fromAdmin.map((r) => r.id).sort()).toEqual([forSue.id, forAll.id].sort())
      expect(mine.fromAdmin[0].owner).toEqual({ id: zin.id, displayName: 'Zin' })
    })

    test('an Admin has no personal reminders and no rules from an Admin', async () => {
      const zin = await newUser('admin', 'Zin')
      const sue = await newUser('student', 'Sue')
      await link(zin.id, sue.id)
      await adminRule(zin.id, null, { trigger: 'daily', time: '20:00', days: [1] })
      expect(await getMyReminders(zin)).toEqual({ quietHours: null, personal: [], fromAdmin: [] })
    })
  })
})
