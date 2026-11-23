// @vitest-environment node
// Spec 006 T051 against the dev database: one-off messages (contracts/server-actions.md › Messages;
// data-model.md ScheduledMessage.mode, ScheduledMessage.send_at, ScheduledMessage.status,
// ScheduledMessageRecipient.deliver_at, ScheduledMessageRecipient.delivered_at). Guards run in the
// actions (requireRole('admin') + requireAdminOfAll, covered in src/server/auth/guards.test.ts); here
// every function takes the caller and checks scoping. "Now" is Wed 3 Mar 2027 12:00 Tokyo.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import {
  availability,
  cancelMessage,
  getMessage,
  listMessages,
  scheduleMessage,
  updateMessage,
} from './messages-repo'
import type { ScheduleMessageInput } from './schemas'

vi.setConfig({ testTimeout: 60_000 })

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'
const run = Date.now()
const users: string[] = []
const at = (date: string, time: string, zone = TOKYO) => zonedToUtc(date, time, zone)
const now = at('2027-03-03', '12:00')

async function newUser(role: 'student' | 'admin', name: string, timezone = TOKYO) {
  const id = randomUUID()
  users.push(id)
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`messages-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone } })
  return { id, displayName: name, timezone }
}

let zin: { id: string }
let thu: { id: string }
let may: { id: string }
let ken: { id: string }
let shared: string
let mayOnly: string

beforeAll(async () => {
  zin = await newUser('admin', 'Zin', YANGON)
  thu = await newUser('admin', 'Thu', YANGON)
  may = await newUser('student', 'May')
  ken = await newUser('student', 'Ken')
  await prisma.studentLink.createMany({
    data: [
      { adminId: zin.id, studentId: may.id, status: 'active' },
      { adminId: zin.id, studentId: ken.id, status: 'active' },
    ],
  })
  const course = (title: string) =>
    prisma.course.create({ data: { ownerId: zin.id, title, status: 'active' } })
  const lesson = (courseId: string, title: string) =>
    prisma.lesson.create({ data: { courseId, title, status: 'published', position: 0 } })
  const both = await course('JLPT N4')
  const solo = await course('Kanji')
  shared = (await lesson(both.id, 'Particle で for means')).id
  mayOnly = (await lesson(solo.id, 'Kanji 1')).id
  await prisma.courseAssignment.createMany({
    data: [
      { courseId: both.id, studentId: may.id, assignedBy: zin.id },
      { courseId: both.id, studentId: ken.id, assignedBy: zin.id },
      { courseId: solo.id, studentId: may.id, assignedBy: zin.id },
    ],
  })
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ActionFailure)
  await expect(promise).rejects.toMatchObject({ code })
}

const input = (overrides: Partial<ScheduleMessageInput> = {}): ScheduleMessageInput => ({
  studentIds: [may.id, ken.id],
  body: 'Particle で is only 15 min, {name}.',
  when: { mode: 'fixed', at: at('2027-03-03', '18:00').toISOString() },
  urgent: false,
  ...overrides,
})

const recipients = (messageId: string) =>
  prisma.scheduledMessageRecipient.findMany({
    where: { messageId },
    orderBy: { student: { displayName: 'asc' } },
  })

/** As the dispatcher hands a recipient over. */
const handOver = (messageId: string, studentId: string, deliveredAt = now) =>
  prisma.scheduledMessageRecipient.update({
    where: { messageId_studentId: { messageId, studentId } },
    data: { deliveredAt },
  })

describe('scheduleMessage', () => {
  test('Now: every recipient now, send_at now', async () => {
    const { message } = await scheduleMessage(zin.id, input({ when: { mode: 'now' } }), now)
    expect(message).toMatchObject({ mode: 'now', status: 'scheduled', urgent: false })
    const rows = await recipients(message.id)
    expect(rows.map((r) => r.deliverAt)).toEqual([now, now])
    const stored = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: message.id } })
    expect(stored.sendAt).toEqual(now)
  })

  test('a fixed time: every recipient then, with the lesson every student can read', async () => {
    const eighteen = at('2027-03-03', '18:00')
    const { message } = await scheduleMessage(
      zin.id,
      input({ lessonId: shared, urgent: true }),
      now,
    )
    expect(message).toMatchObject({
      mode: 'fixed',
      urgent: true,
      lesson: { id: shared, title: 'Particle で for means' },
    })
    expect(message.recipients.map((r) => [r.student.displayName, r.deliverAt, r.state])).toEqual([
      ['Ken', eighteen.toISOString(), 'scheduled'],
      ['May', eighteen.toISOString(), 'scheduled'],
    ])
  })

  test('Next free: each student’s own next free moment, send_at null', async () => {
    await prisma.shift.create({
      data: {
        studentId: may.id,
        type: 'custom',
        startAt: at('2027-03-03', '11:00'),
        endAt: at('2027-03-03', '15:00'),
      },
    })
    const { message } = await scheduleMessage(zin.id, input({ when: { mode: 'next_free' } }), now)
    const rows = await recipients(message.id)
    expect(rows.map((r) => r.deliverAt)).toEqual([now, at('2027-03-03', '15:00')]) // Ken, May
    const stored = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: message.id } })
    expect(stored).toMatchObject({ mode: 'next_free', sendAt: null })
  })

  test('a fixed time in the past → message_time_past', async () => {
    const past = { mode: 'fixed' as const, at: at('2027-03-03', '11:00').toISOString() }
    await expectCode(scheduleMessage(zin.id, input({ when: past }), now), 'message_time_past')
  })

  test('a lesson not every student can read → lesson_not_found', async () => {
    await expectCode(scheduleMessage(zin.id, input({ lessonId: mayOnly }), now), 'lesson_not_found')
    const { message } = await scheduleMessage(
      zin.id,
      input({ studentIds: [may.id], lessonId: mayOnly }),
      now,
    )
    expect(message.lesson?.id).toBe(mayOnly)
  })
})

describe('updateMessage', () => {
  test('changes only recipients not handed over yet', async () => {
    const { message } = await scheduleMessage(zin.id, input(), now)
    await handOver(message.id, may.id)
    const twenty = at('2027-03-03', '20:00')
    const { message: updated } = await updateMessage(
      zin.id,
      {
        ...input({ body: 'Edited', when: { mode: 'fixed', at: twenty.toISOString() } }),
        id: message.id,
      },
      now,
    )
    expect(updated.body).toBe('Edited')
    const rows = await recipients(message.id)
    expect(rows.map((r) => r.deliverAt)).toEqual([twenty, at('2027-03-03', '18:00')]) // Ken, May
  })

  test('a student dropped from To loses a pending delivery; a new one is added', async () => {
    const lin = await newUser('student', 'Lin')
    await prisma.studentLink.create({
      data: { adminId: zin.id, studentId: lin.id, status: 'active' },
    })
    const { message } = await scheduleMessage(zin.id, input(), now)
    await updateMessage(zin.id, { ...input({ studentIds: [may.id, lin.id] }), id: message.id }, now)
    expect((await recipients(message.id)).map((r) => r.studentId).sort()).toEqual(
      [may.id, lin.id].sort(),
    )
  })

  test('fully handed over → message_already_sent', async () => {
    const { message } = await scheduleMessage(zin.id, input(), now)
    await handOver(message.id, may.id)
    await handOver(message.id, ken.id)
    await expectCode(
      updateMessage(zin.id, { ...input({ body: 'Too late' }), id: message.id }, now),
      'message_already_sent',
    )
  })
})

describe('cancelMessage', () => {
  test('nothing handed over: cancelled, still showing who it was for', async () => {
    const { message } = await scheduleMessage(zin.id, input(), now)
    await cancelMessage(zin.id, { id: message.id })
    const { message: cancelled } = await getMessage(zin.id, message.id)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.recipients.map((r) => r.student.displayName)).toEqual(['Ken', 'May'])
    await expectCode(cancelMessage(zin.id, { id: message.id }), 'message_not_found')
  })

  test('some already went: the rest are deleted and the status is sent', async () => {
    const { message } = await scheduleMessage(zin.id, input(), now)
    await handOver(message.id, may.id)
    await cancelMessage(zin.id, { id: message.id })
    expect((await recipients(message.id)).map((r) => r.studentId)).toEqual([may.id])
    expect((await getMessage(zin.id, message.id)).message.status).toBe('sent')
  })

  test('all handed over → message_already_sent', async () => {
    const { message } = await scheduleMessage(zin.id, input({ studentIds: [may.id] }), now)
    await handOver(message.id, may.id)
    await expectCode(cancelMessage(zin.id, { id: message.id }), 'message_already_sent')
  })
})

describe('read status (data-model.md › Derived values)', () => {
  test('scheduled until handed over and while held, then delivered, then read', async () => {
    const { message } = await scheduleMessage(zin.id, input(), now)
    const row = (userId: string, deliveredAt: Date | null, readAt: Date | null = null) =>
      prisma.notification.create({
        data: {
          userId,
          sourceType: 'message',
          sourceId: message.id,
          occurrenceKey: 'message',
          title: 'Zin',
          body: 'Hi',
          deliveredAt,
          readAt,
        },
      })
    await handOver(message.id, may.id)
    await handOver(message.id, ken.id)
    const held = await row(may.id, null)
    const states = async () =>
      (await getMessage(zin.id, message.id)).message.recipients.map((r) => [
        r.student.displayName,
        r.state,
      ])
    expect(await states()).toEqual([
      ['Ken', 'scheduled'],
      ['May', 'scheduled'],
    ])
    await prisma.notification.update({ where: { id: held.id }, data: { deliveredAt: now } })
    await row(ken.id, now, now)
    expect(await states()).toEqual([
      ['Ken', 'read'],
      ['May', 'delivered'],
    ])
  })
})

describe('listMessages', () => {
  test('scheduled ones soonest first; this week’s sent and cancelled newest first; the count', async () => {
    const admin = await newUser('admin', 'Aye', YANGON)
    const su = await newUser('student', 'Su')
    await prisma.studentLink.create({
      data: { adminId: admin.id, studentId: su.id, status: 'active' },
    })
    const make = (
      body: string,
      when: Date,
      status: 'scheduled' | 'sent' | 'cancelled',
      handed?: Date,
    ) =>
      prisma.scheduledMessage.create({
        data: {
          adminId: admin.id,
          body,
          mode: 'fixed',
          sendAt: when,
          status,
          createdAt: handed ?? when,
          recipients:
            status === 'cancelled'
              ? undefined
              : { create: { studentId: su.id, deliverAt: when, deliveredAt: handed ?? null } },
        },
      })
    await make('Later', at('2027-03-04', '18:00'), 'scheduled')
    await make('Sooner', at('2027-03-03', '18:00'), 'scheduled')
    await make('Monday', at('2027-03-01', '09:00'), 'sent', at('2027-03-01', '09:00'))
    await make('Tuesday', at('2027-03-02', '09:00'), 'sent', at('2027-03-02', '09:00'))
    await make('Called off', at('2027-03-02', '12:00'), 'cancelled', at('2027-03-02', '12:00'))
    await make('Last week', at('2027-02-25', '09:00'), 'sent', at('2027-02-25', '09:00'))

    const list = await listMessages(admin.id, null, { now, timeZone: YANGON })
    expect(list.scheduled.map((m) => m.body)).toEqual(['Sooner', 'Later'])
    expect(list.recent.map((m) => [m.body, m.status])).toEqual([
      ['Called off', 'cancelled'],
      ['Tuesday', 'sent'],
      ['Monday', 'sent'],
    ])
    expect(list.sentThisWeek).toBe(2)

    const forSu = await listMessages(admin.id, su.id, { now, timeZone: YANGON })
    expect(forSu.scheduled).toHaveLength(2)
  })
})

describe('availability (research R11)', () => {
  test('free, shift, sleep, outside waking hours and quiet, with the next free moment', async () => {
    const [free, onShift, asleep, night, quiet] = await Promise.all(
      ['Free', 'Shift', 'Sleep', 'Night', 'Quiet'].map((n) => newUser('student', n)),
    )
    await prisma.shift.create({
      data: {
        studentId: onShift.id,
        type: 'custom',
        startAt: at('2027-03-03', '10:00'),
        endAt: at('2027-03-03', '17:00'),
      },
    })
    // Night shift until 07:30, then the 30 min buffer, then 8 h sleep: asleep 08:00–16:00.
    await prisma.shift.create({
      data: {
        studentId: asleep.id,
        type: 'night',
        startAt: at('2027-03-02', '22:00'),
        endAt: at('2027-03-03', '07:30'),
        sleepMinutes: 480,
      },
    })
    await prisma.$executeRaw`update profiles set waking_start = '13:00' where id = ${night.id}::uuid`
    await prisma.$executeRaw`update profiles set quiet_start = '11:30', quiet_end = '12:30'
      where id = ${quiet.id}::uuid`

    const result = await availability([free.id, onShift.id, asleep.id, night.id, quiet.id], now)
    const byId = new Map(result.students.map((s) => [s.id, s]))
    expect(byId.get(free.id)).toEqual({ id: free.id, state: 'free', nextFree: now.toISOString() })
    expect(byId.get(onShift.id)).toMatchObject({
      state: 'shift',
      nextFree: at('2027-03-03', '17:00').toISOString(),
    })
    expect(byId.get(asleep.id)).toMatchObject({
      state: 'sleep',
      nextFree: at('2027-03-03', '16:00').toISOString(),
    })
    expect(byId.get(night.id)).toMatchObject({
      state: 'sleep',
      nextFree: at('2027-03-03', '13:00').toISOString(),
    })
    expect(byId.get(quiet.id)).toMatchObject({
      state: 'quiet',
      nextFree: at('2027-03-03', '12:30').toISOString(),
    })
  })
})

describe('scope', () => {
  test('another Admin’s message → message_not_found', async () => {
    const { message } = await scheduleMessage(zin.id, input(), now)
    await expect(getMessage(thu.id, message.id)).rejects.toBeInstanceOf(NotFound)
    await expectCode(cancelMessage(thu.id, { id: message.id }), 'message_not_found')
    await expectCode(
      updateMessage(thu.id, { ...input(), id: message.id }, now),
      'message_not_found',
    )
  })
})
