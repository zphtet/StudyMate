// @vitest-environment node
// Spec 006 T037 against the dev database: the Admin's rules (contracts/server-actions.md › Rules;
// data-model.md NotificationRule.owner_id, NotificationRule.student_id, NotificationRule.channels,
// NotificationRule.enabled). The guards run in the actions (requireRole('admin'), requireAdminOf; both
// covered in src/server/auth/guards.test.ts); here every function takes the caller and checks scoping.
// Zin (Yangon) has May and Ken linked; Thu is another Admin with Lin.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { pushRecorder } from '../../../tests/utils/push-recorder'
import { deleteRule, getAlerts, getRule, saveRule, sendTestPush, setRuleEnabled } from './repo'
import type { SaveRuleInput, SendTestPushInput } from './schemas'

vi.setConfig({ testTimeout: 60_000 })

const YANGON = 'Asia/Yangon'
const run = Date.now()
const users: string[] = []

type User = { id: string; displayName: string; timezone: string; locale: string }

async function newUser(role: 'student' | 'admin', name: string, timezone = YANGON): Promise<User> {
  const id = randomUUID()
  users.push(id)
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`alerts-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone } })
  return { id, displayName: name, timezone, locale: 'en' }
}

let zin: User
let thu: User
let may: User
let ken: User
let lin: User

beforeAll(async () => {
  zin = await newUser('admin', 'Zin')
  thu = await newUser('admin', 'Thu')
  may = await newUser('student', 'May', 'Asia/Tokyo')
  ken = await newUser('student', 'Ken', 'America/New_York')
  lin = await newUser('student', 'Lin')
  await prisma.studentLink.createMany({
    data: [
      { adminId: zin.id, studentId: may.id, status: 'active' },
      { adminId: zin.id, studentId: ken.id, status: 'active' },
      { adminId: thu.id, studentId: lin.id, status: 'active' },
    ],
  })
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ActionFailure)
  await expect(promise).rejects.toMatchObject({ code })
}

const daily = (
  studentId: string | null,
  overrides: Partial<SaveRuleInput> = {},
): SaveRuleInput => ({
  studentId,
  config: { trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] },
  message: 'Time for {lesson}',
  push: true,
  copyMe: false,
  ...overrides,
})

describe('saveRule', () => {
  test('creates a rule for a linked student, on, with its channels', async () => {
    const { rule } = await saveRule(zin.id, daily(may.id, { copyMe: true }))
    expect(rule).toMatchObject({
      studentId: may.id,
      trigger: 'daily',
      config: { trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] },
      message: 'Time for {lesson}',
      push: true,
      copyMe: true,
      enabled: true,
      isDefault: false,
      owner: { id: zin.id, displayName: 'Zin' },
    })
    const stored = await prisma.notificationRule.findUniqueOrThrow({ where: { id: rule.id } })
    expect(stored).toMatchObject({ ownerId: zin.id, channels: ['push', 'copy'] })
    expect(stored.config).toEqual({ time: '20:00', days: [1, 2, 3, 4, 5] })
  })

  test('creates a rule for All students (studentId null), without push', async () => {
    const { rule } = await saveRule(zin.id, daily(null, { push: false }))
    expect(rule).toMatchObject({ studentId: null, push: false, copyMe: false })
    const stored = await prisma.notificationRule.findUniqueOrThrow({ where: { id: rule.id } })
    expect(stored.channels).toEqual([])
  })

  test('a new rule never claims to be a default one', async () => {
    const config = { trigger: 'streak_risk', time: '21:30', preset: 'default' } as const
    const { rule } = await saveRule(zin.id, daily(ken.id, { config }))
    expect(rule.isDefault).toBe(false)
  })

  test('edits the caller’s rule, changing its trigger and timing', async () => {
    const { rule } = await saveRule(zin.id, daily(may.id))
    const { rule: edited } = await saveRule(
      zin.id,
      daily(may.id, { id: rule.id, config: { trigger: 'after_shift', hours: 2 }, message: 'Rest' }),
    )
    expect(edited).toMatchObject({ id: rule.id, trigger: 'after_shift', message: 'Rest' })
    expect(edited.config).toEqual({ trigger: 'after_shift', hours: 2 })
  })

  test('editing a default rule keeps preset default (so 003 doesn’t add it again)', async () => {
    const seeded = await prisma.notificationRule.create({
      data: {
        ownerId: zin.id,
        studentId: ken.id,
        trigger: 'daily',
        config: { preset: 'default', time: '20:00', days: [1, 2, 3, 4, 5] },
        message: 'Daily',
      },
    })
    const { rule } = await saveRule(
      zin.id,
      daily(ken.id, { id: seeded.id, config: { trigger: 'daily', time: '19:00', days: [1, 3] } }),
    )
    expect(rule.isDefault).toBe(true)
    expect(rule.config).toMatchObject({ time: '19:00', days: [1, 3], preset: 'default' })
  })

  test('editing another Admin’s rule → rule_not_found, and it is unchanged', async () => {
    const theirs = await saveRule(thu.id, daily(lin.id))
    await expectCode(
      saveRule(zin.id, daily(may.id, { id: theirs.rule.id, message: 'Mine now' })),
      'rule_not_found',
    )
    const stored = await prisma.notificationRule.findUniqueOrThrow({
      where: { id: theirs.rule.id },
    })
    expect(stored).toMatchObject({ ownerId: thu.id, message: 'Time for {lesson}' })
  })
})

describe('setRuleEnabled and deleteRule', () => {
  test('turn the caller’s rule off and on', async () => {
    const { rule } = await saveRule(zin.id, daily(may.id))
    await setRuleEnabled(zin.id, { id: rule.id, enabled: false })
    expect((await getRule(zin.id, rule.id)).rule.enabled).toBe(false)
    await setRuleEnabled(zin.id, { id: rule.id, enabled: true })
    expect((await getRule(zin.id, rule.id)).rule.enabled).toBe(true)
  })

  test('another Admin’s rule → rule_not_found', async () => {
    const theirs = await saveRule(thu.id, daily(lin.id))
    await expectCode(
      setRuleEnabled(zin.id, { id: theirs.rule.id, enabled: false }),
      'rule_not_found',
    )
    await expectCode(deleteRule(zin.id, { id: theirs.rule.id }), 'rule_not_found')
    const stored = await prisma.notificationRule.findUniqueOrThrow({
      where: { id: theirs.rule.id },
    })
    expect(stored.enabled).toBe(true)
  })

  test('off drops its reminders still waiting for the student; delivered ones stay', async () => {
    const { rule } = await saveRule(zin.id, daily(may.id))
    const row = (deliveredAt: Date | null, occurrenceKey: string) => ({
      userId: may.id,
      sourceType: 'rule',
      sourceId: rule.id,
      occurrenceKey,
      title: 'Daily study reminder',
      body: 'Time',
      deliveredAt,
    })
    await prisma.notification.createMany({
      data: [row(null, '2027-03-03'), row(new Date(), '2027-03-02')],
    })
    await setRuleEnabled(zin.id, { id: rule.id, enabled: false })
    const left = await prisma.notification.findMany({ where: { sourceId: rule.id } })
    expect(left.map((n) => n.occurrenceKey)).toEqual(['2027-03-02'])
  })

  test('deletes the caller’s rule', async () => {
    const { rule } = await saveRule(zin.id, daily(may.id))
    await deleteRule(zin.id, { id: rule.id })
    expect(await prisma.notificationRule.findUnique({ where: { id: rule.id } })).toBeNull()
  })
})

describe('getRule', () => {
  test('another Admin’s rule, or none, is rule_not_found', async () => {
    const theirs = await saveRule(thu.id, daily(lin.id))
    await expect(getRule(zin.id, theirs.rule.id)).rejects.toBeInstanceOf(NotFound)
    await expect(getRule(zin.id, randomUUID())).rejects.toMatchObject({ code: 'rule_not_found' })
  })
})

describe('getAlerts', () => {
  test('the chips are the caller’s linked students, by name, with their zones', async () => {
    const { students } = await getAlerts(zin.id, null)
    expect(students).toEqual([
      { id: ken.id, displayName: 'Ken', timezone: 'America/New_York' },
      { id: may.id, displayName: 'May', timezone: 'Asia/Tokyo' },
    ])
  })

  test('for a student: their rules and the All students ones, in trigger order', async () => {
    const admin = await newUser('admin', 'Aye')
    const student = await newUser('student', 'Su')
    const other = await newUser('student', 'Hla')
    await prisma.studentLink.createMany({
      data: [
        { adminId: admin.id, studentId: student.id, status: 'active' },
        { adminId: admin.id, studentId: other.id, status: 'active' },
      ],
    })
    const streak = await saveRule(admin.id, {
      ...daily(student.id),
      config: { trigger: 'streak_risk', time: '21:30' },
    })
    const dailyRule = await saveRule(admin.id, daily(student.id))
    const forAll = await saveRule(admin.id, daily(null))
    const forOther = await saveRule(admin.id, daily(other.id))

    const one = await getAlerts(admin.id, student.id)
    expect(one.rules.map((r) => r.id)).toEqual([dailyRule.rule.id, forAll.rule.id, streak.rule.id])

    const all = await getAlerts(admin.id, null)
    expect(all.rules.map((r) => r.id).sort()).toEqual(
      [dailyRule.rule.id, forAll.rule.id, forOther.rule.id, streak.rule.id].sort(),
    )
  })
})

describe('sendTestPush (US2 scenario 5)', () => {
  const now = zonedToUtc('2027-03-03', '12:00', YANGON)
  const testInput = (): SendTestPushInput => ({
    config: { trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] },
    message: '{name}, “{lesson}” is waiting.',
    studentId: may.id,
  })

  async function device(userId: string) {
    return prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: `https://push.example.test/${randomUUID()}`,
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    })
  }

  test('pushes the preview to the caller’s own devices only, with no inbox row', async () => {
    const admin = await newUser('admin', 'Nilar')
    const mine = await device(admin.id)
    await device(may.id)
    const push = pushRecorder()
    const result = await sendTestPush(admin, testInput(), { sender: push.sender, now })
    expect(result).toEqual({ sent: 1 })
    expect(push.sent.map((p) => p.target.endpoint)).toEqual([mine.endpoint])
    // May's name, and a sample lesson because May has no deadline.
    expect(push.sent[0].payload.body).toMatch(/^May, “.+” is waiting\.$/)
    expect(push.sent[0].payload.title).toContain('Daily study reminder')
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBe(0)
  })

  test('with no device → push_no_device', async () => {
    const admin = await newUser('admin', 'Moe')
    const push = pushRecorder()
    await expectCode(
      sendTestPush(admin, testInput(), { sender: push.sender, now }),
      'push_no_device',
    )
  })

  test('in the Admin’s own quiet hours → push_quiet_now, nothing pushed (constitution IV)', async () => {
    const admin = await newUser('admin', 'Hnin')
    await device(admin.id)
    await prisma.$executeRaw`update profiles set quiet_start = '11:00', quiet_end = '13:00'
      where id = ${admin.id}::uuid`
    const push = pushRecorder()
    await expectCode(
      sendTestPush(admin, testInput(), { sender: push.sender, now }),
      'push_quiet_now',
    )
    expect(push.sent).toHaveLength(0)
  })

  test('outside the Admin’s waking hours → push_quiet_now', async () => {
    const admin = await newUser('admin', 'Wai')
    await device(admin.id)
    const push = pushRecorder()
    const night = zonedToUtc('2027-03-03', '03:00', YANGON)
    await expectCode(
      sendTestPush(admin, testInput(), { sender: push.sender, now: night }),
      'push_quiet_now',
    )
    expect(push.sent).toHaveLength(0)
  })
})
