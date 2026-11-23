// @vitest-environment node
// Spec 006 dispatcher against the dev database, with recording push and email senders (research R2,
// R6, R9; data-model.md › Lifecycles › A delivery). Every run is scoped to this file's users, because
// the dev database is shared and "now" is fixed in March 2027 (Mon 1 Mar 2027 is a Monday).
// US1 (T018): delivery, holding for busy recipients, replaced notices, devices, the Sunday check and
// retention.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { emailRecorder } from '../../../tests/utils/email-recorder'
import { pushRecorder } from '../../../tests/utils/push-recorder'
import { dispatch } from './dispatch'
import { recordNotice } from './record'

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
