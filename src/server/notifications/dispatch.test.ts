// @vitest-environment node
// Spec 006 dispatcher against the dev database, with recording push and email senders (research R2,
// R6, R9; data-model.md › Lifecycles › A delivery). Every run is scoped to this file's users, because
// the dev database is shared and "now" is fixed in March 2027 (Mon 1 Mar 2027 is a Monday).
// US1 (T018): delivery, holding for busy recipients, replaced notices, devices, the Sunday check and
// retention.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, test, vi } from 'vitest'
import ja from '@/i18n/messages/ja.json'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { emailRecorder } from '../../../tests/utils/email-recorder'
import { pushRecorder } from '../../../tests/utils/push-recorder'
import { dispatch } from './dispatch'
import { recordNotice } from './record'
import { textsFor } from './texts'

vi.setConfig({ testTimeout: 90_000 })

const TOKYO = 'Asia/Tokyo'
const NEW_YORK = 'America/New_York'
const run = Date.now()
const users: string[] = []

async function newUser({
  role = 'student',
  name = 'May',
  timezone = TOKYO,
}: { role?: 'student' | 'admin'; name?: string; timezone?: string } = {}) {
  const id = randomUUID()
  users.push(id)
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`dispatch-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone } })
  return { id, timezone }
}

afterAll(async () => {
  // Deadlines and assignments point at their Admin without a cascade (set_by, assigned_by).
  await prisma.$executeRaw`delete from public.lesson_deadlines where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const at = (date: string, time: string, zone = TOKYO) => zonedToUtc(date, time, zone)

/** One dispatcher run for these users only, with fresh recorders. */
async function runFor(userIds: string[], now: Date, answer?: Parameters<typeof pushRecorder>[0]) {
  const push = pushRecorder(answer)
  const email = emailRecorder()
  const result = await dispatch(now, { push: push.sender, email: email.sender }, { userIds })
  return { result, pushes: push.sent, emails: email.sent }
}

async function pending(
  userId: string,
  deliverAt: Date,
  data: { push?: boolean; url?: string } = {},
) {
  return prisma.notification.create({
    data: {
      userId,
      sourceType: 'system',
      sourceId: randomUUID(),
      occurrenceKey: 'reviewed',
      title: 'Particles: needs redo',
      body: 'Zin asked you to redo your assignment.',
      url: data.url ?? '/s/lessons/l1',
      deliverAt,
      push: data.push ?? true,
    },
  })
}

async function device(userId: string, endpoint = `https://push.example.test/${randomUUID()}`) {
  return prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: 'p256dh-key', auth: 'auth-key' },
  })
}

const row = (id: string) => prisma.notification.findUnique({ where: { id } })

describe('delivery', () => {
  test('a pending notice for a free recipient goes to every device once, then is delivered', async () => {
    const may = await newUser()
    const [phone, laptop] = [await device(may.id), await device(may.id)]
    const notice = await pending(may.id, at('2027-03-03', '11:55'))
    const now = at('2027-03-03', '12:00')

    const first = await runFor([may.id], now)
    expect(first.pushes.map((p) => p.target.endpoint).sort()).toEqual(
      [phone.endpoint, laptop.endpoint].sort(),
    )
    expect(first.pushes[0].payload).toEqual({
      title: 'Particles: needs redo',
      body: 'Zin asked you to redo your assignment.',
      url: `/s/lessons/l1?n=${notice.id}`,
      tag: notice.id,
    })
    expect((await row(notice.id))?.deliveredAt).toEqual(now)
    expect(first.result).toEqual({
      occurrences: 0,
      handedOver: 0,
      postponed: 0,
      lapsed: 0,
      delivered: 1,
      pushes: 2,
      removedDevices: 0,
    })

    // FR-004, SC-003: a second run (a retry, or the next tick) delivers nothing again.
    const second = await runFor([may.id], new Date(now.getTime() + 60_000))
    expect(second.pushes).toHaveLength(0)
    expect(second.result.delivered).toBe(0)
  })

  test('a row without a link opens the recipient’s inbox', async () => {
    const zin = await newUser({ role: 'admin', name: 'Zin' })
    await device(zin.id)
    const notice = await prisma.notification.create({
      data: {
        userId: zin.id,
        sourceType: 'system',
        sourceId: randomUUID(),
        occurrenceKey: 'submitted',
        title: 'May submitted Particles',
        body: 'Open it to review.',
        deliverAt: at('2027-03-03', '11:00'),
      },
    })
    const { pushes } = await runFor([zin.id], at('2027-03-03', '12:00'))
    expect(pushes[0].payload.url).toBe(`/a/inbox?n=${notice.id}`)
  })

  test('a row due later waits for its time', async () => {
    const may = await newUser()
    await device(may.id)
    const notice = await pending(may.id, at('2027-03-03', '12:30'))
    const { pushes } = await runFor([may.id], at('2027-03-03', '12:00'))
    expect(pushes).toHaveLength(0)
    expect((await row(notice.id))?.deliveredAt).toBeNull()
  })

  test('push false (data-model.md Notification.push): delivered to the inbox, no phone notification', async () => {
    const may = await newUser()
    await device(may.id)
    const notice = await pending(may.id, at('2027-03-03', '11:55'), { push: false })
    const { pushes, result } = await runFor([may.id], at('2027-03-03', '12:00'))
    expect(pushes).toHaveLength(0)
    expect(result.delivered).toBe(1)
    expect((await row(notice.id))?.deliveredAt).not.toBeNull()
  })

  test('a newer notice that replaces a delivered one goes out once more (FR-009)', async () => {
    const may = await newUser()
    await device(may.id)
    const input = {
      userId: may.id,
      sourceId: randomUUID(),
      occurrenceKey: 'deadline',
      title: 'Particles is now due Fri',
      body: 'Changed by Zin.',
      url: '/s/lessons/l1',
    }
    await recordNotice(input)
    const now = at('2027-03-03', '12:00')
    expect((await runFor([may.id], now)).pushes).toHaveLength(1)

    await recordNotice({ ...input, title: 'Particles is now due Sat' })
    const again = await runFor([may.id], new Date(now.getTime() + 300_000))
    expect(again.pushes.map((p) => p.payload.title)).toEqual(['Particles is now due Sat'])
    expect((await runFor([may.id], new Date(now.getTime() + 600_000))).pushes).toHaveLength(0)
  })
})

describe('held while the recipient is busy (FR-003)', () => {
  test('a recipient on shift gets it at the next free moment, not before', async () => {
    const may = await newUser()
    await device(may.id)
    await prisma.shift.create({
      data: {
        studentId: may.id,
        type: 'day',
        startAt: at('2027-03-03', '10:00'),
        endAt: at('2027-03-03', '19:00'),
      },
    })
    const notice = await pending(may.id, at('2027-03-03', '11:55'))

    const during = await runFor([may.id], at('2027-03-03', '12:00'))
    expect(during.pushes).toHaveLength(0)
    expect(during.result.postponed).toBe(1)
    expect(await row(notice.id)).toMatchObject({
      deliverAt: at('2027-03-03', '19:00'),
      deliveredAt: null,
    })

    const after = await runFor([may.id], at('2027-03-03', '19:00'))
    expect(after.pushes).toHaveLength(1)
    expect((await row(notice.id))?.deliveredAt).toEqual(at('2027-03-03', '19:00'))
  })

  test('outside waking hours waits until morning', async () => {
    const may = await newUser()
    await device(may.id)
    const notice = await pending(may.id, at('2027-03-03', '23:30'))
    await runFor([may.id], at('2027-03-03', '23:35'))
    expect((await row(notice.id))?.deliverAt).toEqual(at('2027-03-04', '08:00'))
  })
})

describe('devices (research R6)', () => {
  test('a device the push service no longer knows is removed; the row is still delivered', async () => {
    const may = await newUser()
    const gone = await device(may.id)
    const flaky = await device(may.id)
    const notice = await pending(may.id, at('2027-03-03', '11:55'))
    const { result } = await runFor([may.id], at('2027-03-03', '12:00'), (target) =>
      target.endpoint === gone.endpoint ? 'gone' : 'failed',
    )
    expect(result).toMatchObject({ delivered: 1, pushes: 0, removedDevices: 1 })
    expect((await row(notice.id))?.deliveredAt).not.toBeNull()
    const left = await prisma.pushSubscription.findMany({ where: { userId: may.id } })
    expect(left.map((d) => d.endpoint)).toEqual([flaky.endpoint])
  })
})

describe('the Sunday check (FR-010; data-model.md Profile.shifts_confirmed_week)', () => {
  async function studentWithShift(timezone = TOKYO) {
    const student = await newUser({ timezone })
    await prisma.shift.create({
      data: {
        studentId: student.id,
        type: 'day',
        startAt: at('2027-03-10', '09:00', timezone),
        endAt: at('2027-03-10', '18:00', timezone),
      },
    })
    return student
  }
  const checks = (userId: string) =>
    prisma.notification.findMany({
      where: { userId, occurrenceKey: { startsWith: 'week-check@' } },
    })

  test('from Sunday 18:00 in the student’s time, once, opening Shifts', async () => {
    const may = await studentWithShift()
    await device(may.id)
    await runFor([may.id], at('2027-03-07', '17:55'))
    expect(await checks(may.id)).toHaveLength(0)

    const { pushes } = await runFor([may.id], at('2027-03-07', '18:05'))
    const [check] = await checks(may.id)
    expect(check).toMatchObject({
      sourceType: 'system',
      sourceId: may.id,
      occurrenceKey: 'week-check@2027-03-08',
      url: '/s/shifts',
    })
    expect(check.deliveredAt).not.toBeNull()
    expect(pushes).toHaveLength(1)

    await runFor([may.id], at('2027-03-07', '18:10'))
    expect(await checks(may.id)).toHaveLength(1)
  })

  test('in New York it follows New York’s Sunday evening', async () => {
    const ken = await studentWithShift(NEW_YORK)
    await runFor([ken.id], at('2027-03-07', '17:55', NEW_YORK))
    expect(await checks(ken.id)).toHaveLength(0)
    await runFor([ken.id], at('2027-03-07', '18:05', NEW_YORK))
    expect((await checks(ken.id)).map((c) => c.occurrenceKey)).toEqual(['week-check@2027-03-08'])
  })

  test('not when the week is already confirmed, and not without shifts', async () => {
    const confirmed = await studentWithShift()
    await prisma.profile.update({
      where: { id: confirmed.id },
      data: { shiftsConfirmedWeek: new Date('2027-03-08') },
    })
    const noShifts = await newUser()
    await runFor([confirmed.id, noShifts.id], at('2027-03-07', '18:05'))
    expect(await checks(confirmed.id)).toHaveLength(0)
    expect(await checks(noShifts.id)).toHaveLength(0)
  })

  test('a check held by a shift is dropped once the student confirms the week', async () => {
    const may = await studentWithShift()
    await device(may.id)
    await prisma.shift.create({
      data: {
        studentId: may.id,
        type: 'evening',
        startAt: at('2027-03-07', '17:00'),
        endAt: at('2027-03-07', '22:00'),
      },
    })
    await runFor([may.id], at('2027-03-07', '18:05'))
    const [held] = await checks(may.id)
    expect(held).toMatchObject({ deliveredAt: null, deliverAt: at('2027-03-07', '22:00') })

    await prisma.profile.update({
      where: { id: may.id },
      data: { shiftsConfirmedWeek: new Date('2027-03-08') },
    })
    const { pushes, result } = await runFor([may.id], at('2027-03-07', '22:00'))
    expect(pushes).toHaveLength(0)
    expect(result.lapsed).toBe(1)
    expect(await checks(may.id)).toHaveLength(0)
  })
})

describe('retention (research R9)', () => {
  test('rows older than 90 days go on the first run after 03:00 UTC', async () => {
    const may = await newUser()
    const old = (days: number) =>
      prisma.notification.create({
        data: {
          userId: may.id,
          sourceType: 'system',
          sourceId: randomUUID(),
          occurrenceKey: `old-${days}`,
          title: 'Old',
          body: 'Old',
          deliverAt: new Date(Date.UTC(2027, 2, 3) - days * 86_400_000),
          deliveredAt: new Date(Date.UTC(2027, 2, 3) - days * 86_400_000),
        },
      })
    const [ancient, recent] = [await old(100), await old(30)]

    await runFor([may.id], new Date('2027-03-03T02:55:00Z'))
    expect(await row(ancient.id)).not.toBeNull()

    await runFor([may.id], new Date('2027-03-03T03:02:00Z'))
    expect(await row(ancient.id)).toBeNull()
    expect(await row(recent.id)).not.toBeNull()

    // Only that first run: later runs that day leave old rows alone.
    const later = await old(120)
    await runFor([may.id], new Date('2027-03-03T03:07:00Z'))
    expect(await row(later.id)).not.toBeNull()
  })
})

// US2 (T038): rule occurrences, channels, who gets them, lapsing, the re-check before delivery and
// the weekly summary (research R2 step 1, R3, R4, R13; FR-011, FR-017–FR-020).
describe('rules (US2)', () => {
  const YANGON = 'Asia/Yangon'

  async function pair({ studentZone = TOKYO }: { studentZone?: string } = {}) {
    const zin = await newUser({ role: 'admin', name: 'Zin', timezone: YANGON })
    const may = await newUser({ name: 'May', timezone: studentZone })
    await link(zin.id, may.id)
    return { zin, may }
  }

  const link = (adminId: string, studentId: string, status: 'active' | 'removed' = 'active') =>
    prisma.studentLink.create({ data: { adminId, studentId, status } })

  function rule(
    ownerId: string,
    studentId: string | null,
    trigger: 'daily' | 'due_soon' | 'streak_risk' | 'inactive' | 'weekly_summary',
    config: Record<string, unknown>,
    data: { message?: string; channels?: string[]; enabled?: boolean } = {},
  ) {
    return prisma.notificationRule.create({
      data: {
        ownerId,
        studentId,
        trigger,
        config: config as never,
        message: data.message ?? '{name}, time for today’s lesson.',
        channels: data.channels ?? ['push'],
        enabled: data.enabled ?? true,
      },
    })
  }
  const dailyRule = (ownerId: string, studentId: string | null, data = {}) =>
    rule(ownerId, studentId, 'daily', { time: '20:00', days: [1, 2, 3, 4, 5] }, data)

  const ruleRows = (userId: string) =>
    prisma.notification.findMany({
      where: { userId, sourceType: 'rule' },
      orderBy: { occurrenceKey: 'asc' },
    })

  async function assignedLesson(
    adminId: string,
    studentId: string,
    dueAt: Date | null,
    title = 'Particles',
  ) {
    const course = await prisma.course.create({
      data: { ownerId: adminId, title: 'JLPT N4', status: 'active' },
    })
    const lesson = await prisma.lesson.create({
      data: { courseId: course.id, title, status: 'published', position: 0 },
    })
    await prisma.courseAssignment.create({
      data: { courseId: course.id, studentId, assignedBy: adminId },
    })
    if (dueAt) {
      await prisma.lessonDeadline.create({
        data: { lessonId: lesson.id, studentId, dueAt, setBy: adminId },
      })
    }
    return lesson
  }

  /** 15 minutes of focus: an active day (004 FR-006). */
  const studied = (studentId: string, startedAt: Date) =>
    prisma.studySession.create({
      data: {
        studentId,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 15 * 60_000),
        plannedMinutes: 15,
      },
    })

  const shift = (studentId: string, startAt: Date, endAt: Date) =>
    prisma.shift.create({ data: { studentId, type: 'custom', startAt, endAt } })

  test('independent test: Daily 20:00 Mon–Fri reaches May at 20:00 her time on weekdays only', async () => {
    const { zin, may } = await pair()
    await device(may.id)
    const daily = await dailyRule(zin.id, may.id)

    const wednesday = await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
    expect(wednesday.result).toMatchObject({ occurrences: 1, delivered: 1, pushes: 1 })
    const [row] = await ruleRows(may.id)
    expect(row).toMatchObject({
      sourceId: daily.id,
      occurrenceKey: '2027-03-03',
      title: 'Daily study reminder',
      body: 'May, time for today’s lesson.',
      deliveredAt: at('2027-03-03', '20:00'),
      expiresAt: at('2027-03-04', '00:00'),
    })
    expect(wednesday.pushes[0].payload).toMatchObject({ title: 'Daily study reminder' })

    const saturday = await runFor([zin.id, may.id], at('2027-03-06', '20:00'))
    expect(saturday.result.occurrences).toBe(0)
    expect(await ruleRows(may.id)).toHaveLength(1)
  })

  test('a rule turned off makes nothing; turned on again, nothing missed is sent (scenario 4)', async () => {
    const { zin, may } = await pair()
    const daily = await dailyRule(zin.id, may.id, { enabled: false })
    await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
    expect(await ruleRows(may.id)).toHaveLength(0)

    await prisma.notificationRule.update({ where: { id: daily.id }, data: { enabled: true } })
    await runFor([zin.id, may.id], at('2027-03-04', '20:00'))
    expect((await ruleRows(may.id)).map((r) => r.occurrenceKey)).toEqual(['2027-03-04'])
  })

  test('a later run inside the look-back makes no duplicate (SC-003)', async () => {
    const { zin, may } = await pair()
    await device(may.id)
    await dailyRule(zin.id, may.id)
    await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
    const again = await runFor([zin.id, may.id], at('2027-03-03', '20:05'))
    expect(again.result).toMatchObject({ occurrences: 0, pushes: 0 })
    expect(await ruleRows(may.id)).toHaveLength(1)
  })

  test('Copy me puts an inbox-only copy in the owner’s inbox (FR-018)', async () => {
    const { zin, may } = await pair()
    await device(zin.id)
    await dailyRule(zin.id, may.id, { channels: ['push', 'copy'] })
    await runFor([zin.id, may.id], at('2027-03-03', '20:00'))

    const [copy] = await ruleRows(zin.id)
    expect(copy).toMatchObject({
      occurrenceKey: `${may.id}:2027-03-03`,
      push: false,
      body: 'May, time for today’s lesson.',
    })
    expect(copy.title).toContain('May')
    const next = await runFor([zin.id, may.id], at('2027-03-03', '20:05'))
    expect(next.pushes).toHaveLength(0)
    expect((await ruleRows(zin.id))[0].deliveredAt).not.toBeNull()
  })

  test('without the push channel the student’s row is inbox only', async () => {
    const { zin, may } = await pair()
    await device(may.id)
    await dailyRule(zin.id, may.id, { channels: [] })
    const { pushes } = await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
    expect(pushes).toHaveLength(0)
    expect(await ruleRows(may.id)).toMatchObject([{ push: false }])
  })

  test('an All students rule covers a student linked after it was made (FR-020)', async () => {
    const { zin, may } = await pair()
    await dailyRule(zin.id, null)
    const ken = await newUser({ name: 'Ken' })
    await link(zin.id, ken.id)
    await runFor([zin.id, may.id, ken.id], at('2027-03-03', '20:00'))
    expect(await ruleRows(may.id)).toHaveLength(1)
    expect(await ruleRows(ken.id)).toMatchObject([{ body: 'Ken, time for today’s lesson.' }])
  })

  test('no row for a student who is no longer linked', async () => {
    const { zin, may } = await pair()
    const lin = await newUser({ name: 'Lin' })
    await link(zin.id, lin.id, 'removed')
    await dailyRule(zin.id, lin.id)
    await dailyRule(zin.id, null)
    await runFor([zin.id, may.id, lin.id], at('2027-03-03', '20:00'))
    expect(await ruleRows(lin.id)).toHaveLength(0)
  })

  test('a Daily held by a shift until after local midnight lapses, never in the inbox (FR-017)', async () => {
    const { zin, may } = await pair()
    await device(may.id)
    await dailyRule(zin.id, may.id)
    await shift(may.id, at('2027-03-03', '19:00'), at('2027-03-04', '01:00'))
    const { result, pushes } = await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
    expect(result).toMatchObject({ occurrences: 1, lapsed: 1, delivered: 0 })
    expect(pushes).toHaveLength(0)
    expect(await ruleRows(may.id)).toHaveLength(0)
  })

  test('a held Daily still goes at the next free moment that day', async () => {
    const { zin, may } = await pair()
    await dailyRule(zin.id, may.id)
    await shift(may.id, at('2027-03-03', '19:00'), at('2027-03-03', '21:00'))
    await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
    expect(await ruleRows(may.id)).toMatchObject([
      { deliverAt: at('2027-03-03', '21:00'), deliveredAt: null },
    ])
    await runFor([zin.id, may.id], at('2027-03-03', '21:00'))
    expect((await ruleRows(may.id))[0].deliveredAt).toEqual(at('2027-03-03', '21:00'))
  })

  describe('re-checked just before delivery (research R4, FR-011)', () => {
    /** A Due soon 2 h row made at 20:00 and held by a shift until 21:00. */
    async function heldDueSoon() {
      const { zin, may } = await pair()
      const dueAt = at('2027-03-03', '22:00')
      const lesson = await assignedLesson(zin.id, may.id, dueAt)
      await rule(
        zin.id,
        may.id,
        'due_soon',
        { offsets_h: [2] },
        { message: '“{lesson}” is due {due}.' },
      )
      await shift(may.id, at('2027-03-03', '19:30'), at('2027-03-03', '21:00'))
      await runFor([zin.id, may.id], at('2027-03-03', '20:00'))
      expect(await ruleRows(may.id)).toMatchObject([
        { occurrenceKey: `${lesson.id}@${dueAt.toISOString()}#2`, deliveredAt: null },
      ])
      return { zin, may, lesson }
    }

    test('a Due soon row still applies and goes out', async () => {
      const { zin, may } = await heldDueSoon()
      await runFor([zin.id, may.id], at('2027-03-03', '21:00'))
      expect((await ruleRows(may.id))[0].deliveredAt).not.toBeNull()
    })

    test('dropped when the lesson is completed', async () => {
      const { zin, may, lesson } = await heldDueSoon()
      await prisma.lessonProgress.create({
        data: {
          studentId: may.id,
          lessonId: lesson.id,
          status: 'done',
          completedAt: at('2027-03-03', '20:30'),
        },
      })
      const { result } = await runFor([zin.id, may.id], at('2027-03-03', '21:00'))
      expect(result.lapsed).toBe(1)
      expect(await ruleRows(may.id)).toHaveLength(0)
    })

    test('dropped when the deadline moves, or is removed', async () => {
      const moved = await heldDueSoon()
      await prisma.lessonDeadline.update({
        where: { lessonId_studentId: { lessonId: moved.lesson.id, studentId: moved.may.id } },
        data: { dueAt: at('2027-03-05', '22:00') },
      })
      await runFor([moved.zin.id, moved.may.id], at('2027-03-03', '21:00'))
      expect(await ruleRows(moved.may.id)).toHaveLength(0)

      const removed = await heldDueSoon()
      await prisma.lessonDeadline.delete({
        where: { lessonId_studentId: { lessonId: removed.lesson.id, studentId: removed.may.id } },
      })
      await runFor([removed.zin.id, removed.may.id], at('2027-03-03', '21:00'))
      expect(await ruleRows(removed.may.id)).toHaveLength(0)
    })

    test('a Streak at risk row is dropped once the student has studied that day', async () => {
      const { zin, may } = await pair()
      await rule(zin.id, may.id, 'streak_risk', { time: '21:30' })
      await shift(may.id, at('2027-03-03', '21:00'), at('2027-03-03', '22:30'))
      await runFor([zin.id, may.id], at('2027-03-03', '21:30'))
      expect(await ruleRows(may.id)).toHaveLength(1)
      await studied(may.id, at('2027-03-03', '22:00'))
      await runFor([zin.id, may.id], at('2027-03-03', '22:30'))
      expect(await ruleRows(may.id)).toHaveLength(0)
    })

    test('an Inactive row is dropped once the student studies again', async () => {
      const { zin, may } = await pair()
      await studied(may.id, at('2027-03-01', '12:00'))
      await rule(zin.id, may.id, 'inactive', { days: 2, to: ['student'] })
      await runFor([zin.id, may.id], at('2027-03-04', '00:00'))
      // Held until May's waking hours begin.
      expect(await ruleRows(may.id)).toMatchObject([
        { occurrenceKey: 'inactive@2027-03-01', deliverAt: at('2027-03-04', '08:00') },
      ])
      await studied(may.id, at('2027-03-04', '07:00'))
      await runFor([zin.id, may.id], at('2027-03-04', '08:00'))
      expect(await ruleRows(may.id)).toHaveLength(0)
    })
  })

  describe('the weekly summary (FR-019, research R13)', () => {
    async function busyWeek(adminId: string, studentId: string, zone = TOKYO) {
      await studied(studentId, at('2027-03-05', '12:00', zone))
      const done = await assignedLesson(adminId, studentId, null, 'Done lesson')
      await prisma.lessonProgress.create({
        data: {
          studentId,
          lessonId: done.id,
          status: 'done',
          completedAt: at('2027-03-06', '12:00', zone),
          minutesSpent: 20,
        },
      })
      await assignedLesson(adminId, studentId, at('2027-03-02', '23:59', zone), 'Late lesson')
      await assignedLesson(adminId, studentId, at('2027-03-08', '23:59', zone), 'First')
      await assignedLesson(adminId, studentId, at('2027-03-09', '23:59', zone), 'Second')
      await assignedLesson(adminId, studentId, at('2027-03-11', '23:59', zone), 'Third')
      await assignedLesson(adminId, studentId, at('2027-03-12', '23:59', zone), 'Fourth')
    }

    test('the student gets the week in the inbox and one email to the sign-in address', async () => {
      const { zin, may } = await pair()
      await busyWeek(zin.id, may.id)
      await rule(
        zin.id,
        may.id,
        'weekly_summary',
        { weekday: 7, time: '18:00', to: ['student'] },
        {
          message: 'Well done this week, {name}.',
        },
      )
      const { emails } = await runFor([zin.id, may.id], at('2027-03-07', '18:00'))

      const [row] = await ruleRows(may.id)
      expect(row).toMatchObject({ occurrenceKey: 'week@2027-03-01', expiresAt: null })
      expect(row.deliveredAt).not.toBeNull()
      expect(row.body).toContain('Well done this week, May.')
      expect(row.body).toMatch(/1 lesson done/)
      expect(row.body).toMatch(/35 min/) // 15 min of focus + 20 min of completion credit
      expect(row.body).toMatch(/2-day streak/)
      expect(row.body).toMatch(/1 overdue/)
      expect(row.body).toMatch(/First[\s\S]*Second[\s\S]*Third/)
      expect(row.body).not.toContain('Fourth')

      expect(emails).toHaveLength(1)
      expect(emails[0].to).toBe(`dispatch-${run}-${may.id}@example.test`)
      expect(emails[0].subject).toBe(row.title)
      expect(emails[0].html).toContain('First')
      expect(emails[0].html).not.toContain('<script')
    })

    test('“to admin” on an All students rule: one row and one email, one line per student', async () => {
      const { zin, may } = await pair()
      const ken = await newUser({ name: 'Ken', timezone: TOKYO })
      await link(zin.id, ken.id)
      await busyWeek(zin.id, may.id)
      await rule(zin.id, null, 'weekly_summary', { weekday: 7, time: '18:00', to: ['admin'] })

      const { emails } = await runFor([zin.id, may.id, ken.id], at('2027-03-07', '18:00', YANGON))
      const rows = await ruleRows(zin.id)
      expect(rows).toHaveLength(1)
      expect(rows[0].occurrenceKey).toBe('week@2027-03-01')
      expect(rows[0].body).toMatch(/May:[\s\S]*\n[\s\S]*Ken:|Ken:[\s\S]*\n[\s\S]*May:/)
      expect(await ruleRows(may.id)).toHaveLength(0)
      expect(emails.map((e) => e.to)).toEqual([`dispatch-${run}-${zin.id}@example.test`])
    })
  })

  test('Inactive to the Admin: two students with the same last day give two rows, in the Admin’s hours', async () => {
    const { zin, may } = await pair()
    const ken = await newUser({ name: 'Ken', timezone: TOKYO })
    await link(zin.id, ken.id)
    // Zin's day ends at 21:00 Yangon; Thu 00:00 Tokyo is Wed 21:30 there.
    await prisma.$executeRaw`update profiles set waking_end = '21:00' where id = ${zin.id}::uuid`
    await studied(may.id, at('2027-03-01', '12:00'))
    await studied(ken.id, at('2027-03-01', '15:00'))
    await rule(zin.id, null, 'inactive', { days: 2, to: ['admin'] })

    await runFor([zin.id, may.id, ken.id], at('2027-03-04', '00:00'))
    const rows = await ruleRows(zin.id)
    expect(rows.map((r) => r.occurrenceKey).sort()).toEqual(
      [`${may.id}:inactive@2027-03-01`, `${ken.id}:inactive@2027-03-01`].sort(),
    )
    for (const row of rows) {
      expect(row).toMatchObject({
        push: true,
        deliveredAt: null,
        deliverAt: at('2027-03-04', '08:00', YANGON),
      })
    }
    expect(rows.map((r) => r.title).join(' ')).toMatch(/May.*Ken|Ken.*May/)
    expect(await ruleRows(may.id)).toHaveLength(0)
  })

  test('text in the recipient’s language, with {due} in the student’s zone', async () => {
    const { zin, may } = await pair()
    await prisma.profile.update({ where: { id: may.id }, data: { locale: 'ja' } })
    const dueAt = at('2027-03-03', '22:00')
    await assignedLesson(zin.id, may.id, dueAt, 'Particles は vs が')
    await rule(
      zin.id,
      may.id,
      'due_soon',
      { offsets_h: [2] },
      { message: '「{lesson}」は{due}まで' },
    )
    await runFor([zin.id, may.id], at('2027-03-03', '20:00'))

    const { when } = await textsFor({ id: may.id, locale: 'ja', timezone: TOKYO })
    const [row] = await ruleRows(may.id)
    expect(row.title).toBe(ja.ruleSummary.title.due_soon)
    expect(row.body).toBe(`「Particles は vs が」は${when(dueAt)}まで`)
    expect(row.url).toMatch(/^\/s\/lessons\//)
  })
})
