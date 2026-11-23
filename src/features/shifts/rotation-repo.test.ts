// @vitest-environment node
// Spec 005 US2 (T037) against the dev database: rotations generate concrete shifts 8 weeks ahead,
// skip the student's own days, and are replaced or removed without touching started, past or edited
// shifts (research R4; FR-007, FR-010; data-model.md ShiftPattern.active,
// ShiftPattern.generated_until, Shift.pattern_id, Shift.overridden). "Now" is fixed at Mon 1 Mar
// 2027 12:00 in Tokyo, so the cut-off between started and future shifts is known.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import { addCalendarDays, utcToZoned, zonedToUtc } from '@/lib/time'
import { deleteShift, saveShift } from './repo'
import {
  confirmShiftWeek,
  deleteRotation,
  regenerateFuture,
  saveRotation,
  topUpRotations,
} from './rotation-repo'

vi.setConfig({ testTimeout: 90_000 })

const TOKYO = 'Asia/Tokyo'
const NOW = zonedToUtc('2027-03-01', '12:00', TOKYO)
const at = (date: string, time: string) => zonedToUtc(date, time, TOKYO)
const run = Date.now()
const users: string[] = []

async function newStudent() {
  const id = randomUUID()
  users.push(id)
  const meta = JSON.stringify({ role: 'student', display_name: 'Student' })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`rotation-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone: TOKYO } })
  return { id, timezone: TOKYO, sleepMinutes: 480 }
}

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const shiftsOf = (studentId: string) =>
  prisma.shift.findMany({ where: { studentId }, orderBy: { startAt: 'asc' } })
const localDate = (instant: Date) => utcToZoned(instant, TOKYO).date

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ActionFailure)
  return error as ActionFailure
}

describe('saveRotation', () => {
  test('generates today → today + 56 days, Nights with the student’s sleep, and records how far', async () => {
    const may = await newStudent()
    const result = await saveRotation(may, { sequence: 'DDDONNOO', startDate: '2027-03-01' }, NOW)
    expect(result).toEqual({ generatedUntil: '2027-04-26', skippedDays: [] })

    const rows = await shiftsOf(may.id)
    // 57 days: 7 cycles of 5 working days + one more Day; today's 09:00 Day has already started.
    expect(rows).toHaveLength(35)
    expect(rows.every((r) => r.patternId !== null && !r.overridden)).toBe(true)
    expect(rows[0]).toMatchObject({ type: 'day', startAt: at('2027-03-02', '09:00') })
    const nights = rows.filter((r) => r.type === 'night')
    expect(nights).toHaveLength(14)
    expect(nights.every((r) => r.sleepMinutes === 480)).toBe(true)
    expect(localDate(rows[rows.length - 1].startAt)).toBe('2027-04-26')

    const pattern = await prisma.shiftPattern.findFirstOrThrow({ where: { studentId: may.id } })
    expect(pattern).toMatchObject({ active: true, sequence: 'DDDONNOO' })
    expect(pattern.generatedUntil?.toISOString().slice(0, 10)).toBe('2027-04-26')
  })

  test('skips and reports days that already have the student’s own shift', async () => {
    const bea = await newStudent()
    // A hand-entered Day on 3 Mar (the generated Night wouldn't overlap it), an Off day on 4 Mar,
    // an overridden shift of an old rotation on 5 Mar, and a long shift from 6 Mar 23:00 that runs
    // into 7 Mar's generated Night.
    await saveShift(bea, {
      date: '2027-03-03',
      type: 'day',
      start: '09:00',
      end: '18:00',
      blockSleep: false,
    })
    await saveShift(bea, { date: '2027-03-04', type: 'off', blockSleep: false })
    const old = await prisma.shiftPattern.create({
      data: { studentId: bea.id, sequence: 'D', startDate: new Date('2027-01-01'), active: false },
    })
    await prisma.shift.create({
      data: {
        studentId: bea.id,
        type: 'evening',
        startAt: at('2027-03-05', '14:00'),
        endAt: at('2027-03-05', '23:00'),
        patternId: old.id,
        overridden: true,
      },
    })
    await saveShift(bea, {
      date: '2027-03-06',
      type: 'custom',
      start: '23:00',
      end: '22:30',
      blockSleep: false,
    })

    const { skippedDays } = await saveRotation(bea, { sequence: 'N', startDate: '2027-03-02' }, NOW)
    expect(skippedDays).toEqual([
      '2027-03-03',
      '2027-03-04',
      '2027-03-05',
      '2027-03-06',
      '2027-03-07',
    ])
    const generated = await prisma.shift.findMany({
      where: { studentId: bea.id, pattern: { active: true } },
      orderBy: { startAt: 'asc' },
      take: 2,
    })
    expect(generated.map((r) => localDate(r.startAt))).toEqual(['2027-03-02', '2027-03-08'])
  })

  test('after a change, a day deleted from the old rotation stays Off', async () => {
    const cy = await newStudent()
    await saveRotation(cy, { sequence: 'D', startDate: '2027-03-02' }, NOW)
    const fourth = await prisma.shift.findFirstOrThrow({
      where: { studentId: cy.id, startAt: at('2027-03-04', '09:00') },
    })
    await deleteShift(cy, fourth.id)

    await saveRotation(cy, { sequence: 'E', startDate: '2027-03-02' }, NOW)
    const week = (await shiftsOf(cy.id)).filter((r) => r.startAt < at('2027-03-07', '00:00'))
    expect(week.map((r) => [localDate(r.startAt), r.type])).toEqual([
      ['2027-03-02', 'evening'],
      ['2027-03-03', 'evening'],
      ['2027-03-04', 'off'],
      ['2027-03-05', 'evening'],
      ['2027-03-06', 'evening'],
    ])
  })

  test('a change replaces only untouched shifts that haven’t started; started, past and edited ones stay', async () => {
    const dee = await newStudent()
    const earlier = zonedToUtc('2027-02-26', '06:00', TOKYO)
    await saveRotation(dee, { sequence: 'D', startDate: '2027-02-26' }, earlier)
    const [oldPattern] = await prisma.shiftPattern.findMany({ where: { studentId: dee.id } })
    const edited = await prisma.shift.findFirstOrThrow({
      where: { studentId: dee.id, startAt: at('2027-03-03', '09:00') },
    })
    await saveShift(dee, {
      shiftId: edited.id,
      date: '2027-03-03',
      type: 'day',
      start: '10:00',
      end: '19:00',
      blockSleep: false,
    })

    await saveRotation(dee, { sequence: 'E', startDate: '2027-03-01' }, NOW)
    const rows = await shiftsOf(dee.id)
    const byDate = (date: string) => rows.filter((r) => localDate(r.startAt) === date)
    // Past days and today's running Day (09:00–18:00 at 12:00) keep the old rotation.
    for (const date of ['2027-02-26', '2027-02-28', '2027-03-01']) {
      expect(byDate(date).map((r) => [r.type, r.patternId])).toEqual([['day', oldPattern.id]])
    }
    // The edited day stays as the student set it; the others follow the new pattern.
    expect(byDate('2027-03-03').map((r) => [r.type, r.startAt, r.overridden])).toEqual([
      ['day', at('2027-03-03', '10:00'), true],
    ])
    expect(byDate('2027-03-02').map((r) => r.type)).toEqual(['evening'])
    expect(byDate('2027-03-04').map((r) => r.type)).toEqual(['evening'])

    const patterns = await prisma.shiftPattern.findMany({ where: { studentId: dee.id } })
    expect(patterns.filter((p) => p.active).map((p) => p.sequence)).toEqual(['E'])
  })
})

describe('deleteRotation', () => {
  test('removes untouched shifts that haven’t started and deactivates the rotation', async () => {
    const eve = await newStudent()
    await saveRotation(
      eve,
      { sequence: 'D', startDate: '2027-02-27' },
      zonedToUtc('2027-02-27', '06:00', TOKYO),
    )
    const { removed } = await deleteRotation(eve, NOW)
    expect(removed).toBe(54) // 2 Mar … 24 Apr (generated on 27 Feb, so 56 days from then)
    const rows = await shiftsOf(eve.id)
    expect(rows.map((r) => localDate(r.startAt))).toEqual([
      '2027-02-27',
      '2027-02-28',
      '2027-03-01',
    ])
    expect(await prisma.shiftPattern.count({ where: { studentId: eve.id, active: true } })).toBe(0)
    expect((await failure(deleteRotation(eve, NOW))).code).toBe('rotation_not_found')
  })
})

describe('one active rotation (FR-010)', () => {
  test('saving again replaces the active rotation; the database refuses a second one', async () => {
    const fay = await newStudent()
    await saveRotation(fay, { sequence: 'D', startDate: '2027-03-02' }, NOW)
    await saveRotation(fay, { sequence: 'N', startDate: '2027-03-02' }, NOW)
    expect(await prisma.shiftPattern.count({ where: { studentId: fay.id, active: true } })).toBe(1)
    await expect(
      prisma.shiftPattern.create({
        data: { studentId: fay.id, sequence: 'E', startDate: new Date('2027-03-02') },
      }),
    ).rejects.toThrow()
  })
})

describe('regenerateFuture', () => {
  test('new preset times and sleep length reach the rotation’s future shifts, not the edited ones', async () => {
    const gus = await newStudent()
    await saveRotation(gus, { sequence: 'N', startDate: '2027-03-02' }, NOW)
    const edited = await prisma.shift.findFirstOrThrow({
      where: { studentId: gus.id, startAt: at('2027-03-03', '22:00') },
    })
    await saveShift(gus, {
      shiftId: edited.id,
      date: '2027-03-03',
      type: 'night',
      start: '23:00',
      end: '07:00',
      blockSleep: true,
    })
    await prisma.profile.update({
      where: { id: gus.id },
      data: {
        shiftPresets: { D: ['09:00', '18:00'], E: ['14:00', '23:00'], N: ['21:00', '06:00'] },
        sleepMinutes: 540,
      },
    })

    await regenerateFuture(gus, NOW)
    const rows = await shiftsOf(gus.id)
    expect(rows.find((r) => localDate(r.startAt) === '2027-03-02')).toMatchObject({
      startAt: at('2027-03-02', '21:00'),
      endAt: at('2027-03-03', '06:00'),
      sleepMinutes: 540,
    })
    expect(rows.find((r) => localDate(r.startAt) === '2027-03-03')).toMatchObject({
      startAt: at('2027-03-03', '23:00'),
      overridden: true,
    })
  })
})

describe('topUpRotations (daily cron)', () => {
  test('extends every active rotation to today + 56; a second run inserts nothing', async () => {
    // The cron tops up every active rotation in the dev database, e.g. those e2e runs leave, which
    // are generated to real today + 56. A "now" in the past leaves them nothing to do, so only
    // Hal's rotation is written (Mon 2 Mar 2026 12:00 in Tokyo).
    const past = zonedToUtc('2026-03-02', '12:00', TOKYO)
    const hal = await newStudent()
    await saveRotation(hal, { sequence: 'D', startDate: '2026-03-03' }, past)
    const later = new Date(past.getTime() + 3 * 86_400_000) // Thu 5 Mar
    const first = await topUpRotations(later)
    expect(first.rotations).toBeGreaterThanOrEqual(1)
    const pattern = await prisma.shiftPattern.findFirstOrThrow({
      where: { studentId: hal.id, active: true },
    })
    expect(pattern.generatedUntil?.toISOString().slice(0, 10)).toBe(
      addCalendarDays('2026-03-05', 56),
    )
    const last = await prisma.shift.findFirstOrThrow({
      where: { studentId: hal.id },
      orderBy: { startAt: 'desc' },
    })
    expect(localDate(last.startAt)).toBe('2026-04-30')
    expect(await prisma.shift.count({ where: { studentId: hal.id } })).toBe(59)

    expect((await topUpRotations(later)).inserted).toBe(0)
  })
})

describe('confirmShiftWeek (FR-009)', () => {
  test('stores the coming Monday in the student’s zone', async () => {
    const ivy = await newStudent()
    const sunday = zonedToUtc('2027-03-07', '19:00', TOKYO)
    expect(await confirmShiftWeek(ivy, sunday)).toEqual({ week: '2027-03-08' })
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: ivy.id } })
    expect(profile.shiftsConfirmedWeek?.toISOString().slice(0, 10)).toBe('2027-03-08')
  })

  test('answers the Sunday check notification: read if delivered, gone if still held (006 FR-010)', async () => {
    const [ivy, jo] = [await newStudent(), await newStudent()]
    const check = (userId: string, delivered: boolean) =>
      prisma.notification.create({
        data: {
          userId,
          sourceType: 'system',
          sourceId: userId,
          occurrenceKey: 'week-check@2027-03-08',
          title: 'Next week',
          body: 'Correct?',
          deliverAt: zonedToUtc('2027-03-07', '18:05', TOKYO),
          deliveredAt: delivered ? zonedToUtc('2027-03-07', '18:05', TOKYO) : null,
        },
      })
    const delivered = await check(ivy.id, true)
    const joHeld = await check(jo.id, false)

    await confirmShiftWeek(ivy, zonedToUtc('2027-03-07', '19:00', TOKYO))
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: delivered.id } })
    expect(after.readAt).not.toBeNull()
    // Jo hasn't answered yet: Jo's row is untouched.
    expect(await prisma.notification.findUnique({ where: { id: joHeld.id } })).not.toBeNull()

    await confirmShiftWeek(jo, zonedToUtc('2027-03-07', '19:00', TOKYO))
    expect(await prisma.notification.findUnique({ where: { id: joHeld.id } })).toBeNull()
  })
})
