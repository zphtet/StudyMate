// @vitest-environment node
// Spec 005 against the dev database. US1 (T015): saving, editing and deleting shifts, the month read
// and the shift settings (research R2, R3, R10; data-model.md Shift.student_id, Shift.type,
// Shift.start_at, Shift.end_at, Shift.sleep_minutes, Shift.overridden, Shift.pattern_id,
// Profile.shift_presets, Profile.sleep_minutes, Profile.waking_start, Profile.waking_end). US3
// (T050): Today's shift banner (research R7).
// May, Bob and Ann are students in Tokyo, Ken in New York. Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import {
  deleteShift,
  getMonthShifts,
  getShift,
  getShiftSettings,
  getTodayBanner,
  saveShift,
  saveShiftSettings,
} from './repo'

vi.setConfig({ testTimeout: 60_000 })

const TOKYO = 'Asia/Tokyo'
const NY = 'America/New_York'
const run = Date.now()
const may = { id: randomUUID(), timezone: TOKYO, sleepMinutes: 480 }
const bob = { id: randomUUID(), timezone: TOKYO, sleepMinutes: 480 }
const ken = { id: randomUUID(), timezone: NY, sleepMinutes: 480 }
const ann = { id: randomUUID(), timezone: TOKYO, sleepMinutes: 480 }
const users = [may.id, bob.id, ken.id, ann.id]

async function makeStudent({ id, timezone }: { id: string; timezone: string }) {
  const meta = JSON.stringify({ role: 'student', display_name: 'Student' })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`shifts-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone } })
}

beforeAll(async () => {
  await Promise.all([may, bob, ken, ann].map(makeStudent))
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const tokyo = (date: string, time: string) => zonedToUtc(date, time, TOKYO).toISOString()

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ActionFailure)
  return error as ActionFailure
}

/** A rotation and one generated shift of it (rotations themselves arrive with US2). */
async function generatedShift(student: { id: string }, date: string) {
  const pattern = await prisma.shiftPattern.create({
    data: { studentId: student.id, sequence: 'DO', startDate: new Date(`${date}T00:00:00Z`) },
  })
  return prisma.shift.create({
    data: {
      studentId: student.id,
      type: 'day',
      startAt: new Date(tokyo(date, '09:00')),
      endAt: new Date(tokyo(date, '18:00')),
      patternId: pattern.id,
    },
  })
}

describe('saveShift', () => {
  test('an overnight shift is one row in the student’s zone, with their sleep length', async () => {
    const { shift } = await saveShift(may, {
      date: '2026-12-04',
      type: 'night',
      start: '22:00',
      end: '07:00',
      blockSleep: true,
    })
    expect(shift).toMatchObject({
      type: 'night',
      startAt: tokyo('2026-12-04', '22:00'),
      endAt: tokyo('2026-12-05', '07:00'),
      sleepMinutes: 480,
      fromRotation: false,
      overridden: false,
    })
    const rows = await prisma.shift.findMany({ where: { studentId: may.id, type: 'night' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].studentId).toBe(may.id)
  })

  test('Block sleep stores the student’s sleep length; off stores 0', async () => {
    const longSleeper = { ...may, sleepMinutes: 540 }
    const { shift: sleepy } = await saveShift(longSleeper, {
      date: '2026-12-08',
      type: 'evening',
      start: '14:00',
      end: '23:00',
      blockSleep: true,
    })
    expect(sleepy.sleepMinutes).toBe(540)
    const { shift: awake } = await saveShift(may, {
      date: '2026-12-09',
      type: 'day',
      start: '09:00',
      end: '18:00',
      blockSleep: false,
    })
    expect(awake.sleepMinutes).toBe(0)
  })

  test('Off is the whole local day with no sleep, and can share a day with a working shift', async () => {
    const { shift } = await saveShift(may, { date: '2026-12-04', type: 'off', blockSleep: true })
    expect(shift).toMatchObject({
      type: 'off',
      startAt: tokyo('2026-12-04', '00:00'),
      endAt: tokyo('2026-12-05', '00:00'),
      sleepMinutes: 0,
    })
  })

  test('an overlapping working shift fails shift_overlap with the clashing times', async () => {
    const error = await failure(
      saveShift(may, {
        date: '2026-12-05',
        type: 'day',
        start: '06:00',
        end: '10:00',
        blockSleep: false,
      }),
    )
    expect(error.code).toBe('shift_overlap')
    expect(error.params).toEqual({
      start: tokyo('2026-12-04', '22:00'),
      end: tokyo('2026-12-05', '07:00'),
    })
  })

  test('a race past the overlap check is caught by the database and reported the same way', async () => {
    // The lookup finds nothing (another tab saved in between); the EXCLUDE constraint refuses.
    vi.spyOn(prisma.shift, 'findFirst').mockResolvedValueOnce(null)
    const error = await failure(
      saveShift(may, {
        date: '2026-12-05',
        type: 'custom',
        start: '05:00',
        end: '08:00',
        blockSleep: false,
      }),
    )
    expect(error.code).toBe('shift_overlap')
    expect(error.params).toEqual({
      start: tokyo('2026-12-04', '22:00'),
      end: tokyo('2026-12-05', '07:00'),
    })
  })

  test('more than 24 h of real time (a New York fall-back night) fails shift_too_long', async () => {
    const error = await failure(
      saveShift(ken, {
        date: '2026-10-31',
        type: 'custom',
        start: '08:00',
        end: '08:00',
        blockSleep: false,
      }),
    )
    expect(error.code).toBe('shift_too_long')
    const { shift } = await saveShift(ken, {
      date: '2026-10-31',
      type: 'night',
      start: '22:00',
      end: '07:00',
      blockSleep: false,
    })
    expect(new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()).toBe(10 * 3_600_000)
  })

  test('editing keeps one row; editing a generated shift marks it overridden', async () => {
    const generated = await generatedShift(may, '2026-12-14')
    const { shift } = await saveShift(may, {
      shiftId: generated.id,
      date: '2026-12-14',
      type: 'day',
      start: '10:00',
      end: '19:00',
      blockSleep: false,
    })
    expect(shift).toMatchObject({
      id: generated.id,
      startAt: tokyo('2026-12-14', '10:00'),
      fromRotation: true,
      overridden: true,
    })
    const row = await prisma.shift.findUniqueOrThrow({ where: { id: generated.id } })
    expect(row.patternId).toBe(generated.patternId)
  })

  test('another student’s shift id is shift_not_found', async () => {
    const { shift } = await saveShift(bob, {
      date: '2026-12-10',
      type: 'day',
      start: '09:00',
      end: '18:00',
      blockSleep: false,
    })
    const error = await failure(
      saveShift(may, {
        shiftId: shift.id,
        date: '2026-12-10',
        type: 'day',
        start: '10:00',
        end: '18:00',
        blockSleep: false,
      }),
    )
    expect(error.code).toBe('shift_not_found')
    expect((await failure(deleteShift(may, shift.id))).code).toBe('shift_not_found')
    await expect(getShift(may, shift.id)).rejects.toBeInstanceOf(NotFound)
    expect((await getShift(bob, shift.id)).shift.id).toBe(shift.id)
  })
})

describe('deleteShift', () => {
  test('a hand-entered shift is deleted', async () => {
    const { shift } = await saveShift(bob, {
      date: '2026-12-11',
      type: 'day',
      start: '09:00',
      end: '18:00',
      blockSleep: false,
    })
    expect(await deleteShift(bob, shift.id)).toEqual({ removed: 'deleted' })
    expect(await prisma.shift.count({ where: { id: shift.id } })).toBe(0)
  })

  test('a generated shift becomes an overridden Off day, so the rotation won’t fill it again', async () => {
    const generated = await generatedShift(bob, '2026-12-15')
    expect(await deleteShift(bob, generated.id)).toEqual({ removed: 'off' })
    const row = await prisma.shift.findUniqueOrThrow({ where: { id: generated.id } })
    expect(row).toMatchObject({
      type: 'off',
      startAt: new Date(tokyo('2026-12-15', '00:00')),
      endAt: new Date(tokyo('2026-12-16', '00:00')),
      sleepMinutes: 0,
      overridden: true,
      patternId: generated.patternId,
    })
  })
})

describe('getMonthShifts', () => {
  test('returns the month’s shifts ±1 day and the merged busy segments', async () => {
    await saveShift(bob, {
      date: '2027-01-31',
      type: 'night',
      start: '22:00',
      end: '07:00',
      blockSleep: true,
    })
    await saveShift(bob, {
      date: '2027-01-29',
      type: 'day',
      start: '09:00',
      end: '18:00',
      blockSleep: false,
    })
    await saveShift(bob, {
      date: '2027-02-27',
      type: 'day',
      start: '09:00',
      end: '18:00',
      blockSleep: false,
    })
    const month = await getMonthShifts(bob, '2027-02')
    expect(month).toMatchObject({ month: '2027-02', timeZone: TOKYO })
    expect(month.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(month.shifts.map((s) => s.startAt)).toEqual([
      tokyo('2027-01-31', '22:00'),
      tokyo('2027-02-27', '09:00'),
    ])
    // The night shift, then sleep: the 8 h block (07:30–15:30) merges with the night outside waking
    // hours (until 08:00), so Sleep runs from the end of the shift (as on 003's Plan).
    expect(month.segments).toContainEqual({
      kind: 'shift',
      start: tokyo('2027-01-31', '22:00'),
      end: tokyo('2027-02-01', '07:00'),
    })
    expect(month.segments).toContainEqual({
      kind: 'sleep',
      start: tokyo('2027-02-01', '07:00'),
      end: tokyo('2027-02-01', '15:30'),
    })
    const starts = month.segments.map((s) => s.start)
    expect([...starts].sort()).toEqual(starts)
  })

  test('a new time zone keeps every shift’s instants (Edge Cases)', async () => {
    const before = await getMonthShifts(bob, '2027-02')
    await prisma.profile.update({ where: { id: bob.id }, data: { timezone: 'Asia/Yangon' } })
    const after = await getMonthShifts({ ...bob, timezone: 'Asia/Yangon' }, '2027-02')
    expect(after.timeZone).toBe('Asia/Yangon')
    expect(after.shifts.map((s) => [s.startAt, s.endAt])).toEqual(
      before.shifts.map((s) => [s.startAt, s.endAt]),
    )
    await prisma.profile.update({ where: { id: bob.id }, data: { timezone: TOKYO } })
  })
})

describe('shift settings', () => {
  test('a new student has the default presets, sleep length and waking hours', async () => {
    expect(await getShiftSettings(ken)).toEqual({
      settings: {
        presets: { D: ['09:00', '18:00'], E: ['14:00', '23:00'], N: ['22:00', '07:00'] },
        sleepMinutes: 480,
        wakingStart: '08:00',
        wakingEnd: '23:00',
        afterShiftBuffer: 30,
      },
      rotation: null,
    })
  })

  test('saving stores presets, sleep and waking hours; buffer and quiet hours stay', async () => {
    await prisma.$executeRaw`update profiles set quiet_start = '12:00', quiet_end = '13:00'
      where id = ${ken.id}::uuid`
    const settings = {
      presets: {
        D: ['08:00', '17:00'],
        E: ['14:00', '23:00'],
        N: ['21:00', '06:00'],
      } satisfies Record<'D' | 'E' | 'N', [string, string]>,
      sleepMinutes: 420,
      wakingStart: '07:00',
      wakingEnd: '22:30',
    }
    const { settings: saved } = await saveShiftSettings(ken, settings)
    expect(saved).toEqual({ ...settings, afterShiftBuffer: 30 })
    expect((await getShiftSettings(ken)).settings).toEqual(saved)
    const [quiet] = await prisma.$queryRaw<{ start: string; end: string; buffer: number }[]>`
      select quiet_start::text as start, quiet_end::text as end, after_shift_buffer as buffer
      from profiles where id = ${ken.id}::uuid`
    expect(quiet).toEqual({ start: '12:00:00', end: '13:00:00', buffer: 30 })
  })
})

describe('getTodayBanner (research R7)', () => {
  // Ann's week of Mon 3 May 2027 (waking hours 08:00–23:00): a night shift Mon 22:00–Tue 07:00, a
  // Day shift on Wed and an Off day on Thu; a Day shift the Sunday before and the Monday after.
  beforeAll(async () => {
    const day = { type: 'day' as const, start: '09:00', end: '18:00', blockSleep: false }
    await saveShift(ann, { ...day, date: '2027-05-02' })
    await saveShift(ann, {
      date: '2027-05-03',
      type: 'night',
      start: '22:00',
      end: '07:00',
      blockSleep: false,
    })
    await saveShift(ann, { ...day, date: '2027-05-05' })
    await saveShift(ann, { date: '2027-05-06', type: 'off', blockSleep: false })
    await saveShift(ann, { ...day, date: '2027-05-10' })
  })

  const at = (date: string, time: string) => zonedToUtc(date, time, TOKYO)

  test('a night shift later today, and free now until it starts', async () => {
    const banner = await getTodayBanner(ann, at('2027-05-03', '18:00'))
    expect(banner.shift).toEqual({
      type: 'night',
      startAt: tokyo('2027-05-03', '22:00'),
      endAt: tokyo('2027-05-04', '07:00'),
      running: false,
    })
    expect(banner.free).toEqual({ now: true, until: tokyo('2027-05-03', '22:00') })
  })

  test('a running shift, busy now, free again when waking hours start', async () => {
    const banner = await getTodayBanner(ann, at('2027-05-04', '03:00'))
    expect(banner.shift).toMatchObject({ type: 'night', running: true })
    expect(banner.free).toEqual({ now: false, nextAt: tokyo('2027-05-04', '08:00') })
  })

  test('no working shift today (an Off day): no shift, free until waking hours end', async () => {
    const banner = await getTodayBanner(ann, at('2027-05-06', '12:00'))
    expect(banner.shift).toBeNull()
    expect(banner.free).toEqual({ now: true, until: tokyo('2027-05-06', '23:00') })
  })

  test('a shift that already ended today is not shown', async () => {
    const banner = await getTodayBanner(ann, at('2027-05-05', '19:00'))
    expect(banner.shift).toBeNull()
  })

  test('weekShifts counts the working shifts of this local Monday to Sunday', async () => {
    expect((await getTodayBanner(ann, at('2027-05-09', '23:30'))).weekShifts).toBe(2)
    expect((await getTodayBanner(ann, at('2027-05-10', '00:30'))).weekShifts).toBe(1)
  })
})
