import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { fail } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { freeGaps } from '@/lib/availability'
import { prisma } from '@/lib/prisma'
import {
  addCalendarDays,
  datesOfMonth,
  fromClock,
  localDayRange,
  mondayOf,
  shiftInstants,
  startOfLocalDay,
  toClock,
  todayIn,
  utcToZoned,
} from '@/lib/time'
import { getBusySegments } from '@/server/availability'
import { shiftPresetsSchema, type SaveShiftInput, type ShiftSettingsInput } from './schemas'
import type {
  MonthShifts,
  ShiftSettings,
  ShiftSettingsResponse,
  ShiftsToday,
  ShiftView,
  TodayBanner,
} from './types'
import { weekCheck } from '@/lib/week-check'

// Spec 005 shifts and shift settings (research R2, R3, R10; contracts/server-actions.md). Callers MUST
// have run requireRole('student'): every query is scoped to `student.id` from the guard
// (data-model.md Shift.student_id), so another student's shift id is simply not found.
// data-model.md Shift.client_op_id is written when /api/sync replays an offline change (spec 008).

/** The caller's profile fields these functions use (the guard's `me`). */
type Student = { id: string; timezone: string; sleepMinutes: number }

/**
 * A change the student made offline, replayed by /api/sync (spec 008 research R7): its op id (kept
 * as client_op_id) and the version it was made on (null for a new shift). The server wins over it.
 */
export type ReplayedShiftOp = { opId: string; baseUpdatedAt: Date | null }

const MAX_SHIFT_MINUTES = 24 * 60

const shiftSelect = {
  id: true,
  type: true,
  startAt: true,
  endAt: true,
  sleepMinutes: true,
  patternId: true,
  overridden: true,
  updatedAt: true,
} satisfies Prisma.ShiftSelect

type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof shiftSelect }>

function toView(row: ShiftRow): ShiftView {
  return {
    id: row.id,
    type: row.type,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    sleepMinutes: row.sleepMinutes,
    fromRotation: row.patternId !== null,
    overridden: row.overridden,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Instants of the form's local date and times (research R2); Off is the whole local day. */
function instantsOf(input: SaveShiftInput, timeZone: string) {
  const { date, type, start, end } = input
  if (type === 'off') return shiftInstants({ date, start: null, end: null }, timeZone)
  if (start === undefined || end === undefined) fail('invalid_input')
  return shiftInstants({ date, start, end }, timeZone)
}

/** The student's first working shift overlapping [start, end), other than `exceptId`. */
function findOverlap(studentId: string, start: Date, end: Date, exceptId?: string) {
  return prisma.shift.findFirst({
    where: {
      studentId,
      type: { not: 'off' },
      startAt: { lt: end },
      endAt: { gt: start },
      ...(exceptId && { id: { not: exceptId } }),
    },
    orderBy: { startAt: 'asc' },
    select: { startAt: true, endAt: true },
  })
}

function failOverlap(clash: { startAt: Date; endAt: Date }): never {
  fail('shift_overlap', { start: clash.startAt.toISOString(), end: clash.endAt.toISOString() })
}

/** SQLSTATE 23P01: the no-overlap EXCLUDE constraint refused the row (a save raced the check). */
function isOverlapViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined)?.cause
      ?.originalCode === '23P01'
  )
}

/**
 * Add or edit a shift (US1; FR-001, FR-003). Errors: shift_too_long (> 24 h of real time, only on a
 * daylight-saving night), shift_overlap with the clashing shift, shift_not_found. Editing a shift a
 * rotation generated marks it overridden, so rotation changes leave it as set (FR-007).
 */
export async function saveShift(student: Student, input: SaveShiftInput, op?: ReplayedShiftOp) {
  const { start, end, minutes } = instantsOf(input, student.timezone)
  const isWorking = input.type !== 'off'
  if (isWorking && minutes > MAX_SHIFT_MINUTES) fail('shift_too_long')

  const existing = input.shiftId
    ? await prisma.shift.findUnique({
        where: { id: input.shiftId, studentId: student.id },
        select: { id: true, patternId: true, updatedAt: true },
      })
    : null
  if (input.shiftId && !existing) fail('shift_not_found')
  if (op && existing && existing.updatedAt.getTime() !== op.baseUpdatedAt?.getTime()) {
    fail('changed_on_server')
  }

  if (isWorking) {
    const clash = await findOverlap(student.id, start, end, existing?.id)
    if (clash) failOverlap(clash)
  }

  const data = {
    type: input.type,
    startAt: start,
    endAt: end,
    sleepMinutes: isWorking && input.blockSleep ? student.sleepMinutes : 0,
    ...(op && { clientOpId: op.opId }),
  }
  try {
    const row = existing
      ? await prisma.shift.update({
          where: { id: existing.id, studentId: student.id },
          data: { ...data, ...(existing.patternId && { overridden: true }) },
          select: shiftSelect,
        })
      : await prisma.shift.create({
          data: { ...data, studentId: student.id },
          select: shiftSelect,
        })
    return { shift: toView(row) }
  } catch (error) {
    if (isOverlapViolation(error)) {
      const clash = await findOverlap(student.id, start, end, existing?.id)
      if (clash) failOverlap(clash)
    }
    throw error
  }
}

/**
 * Delete a shift. A hand-entered one is removed; a generated one becomes an overridden Off row for
 * its day, so the rotation doesn't fill the day again (research R4; spec Edge Cases).
 */
export async function deleteShift(student: Student, shiftId: string, op?: ReplayedShiftOp) {
  const row = await prisma.shift.findUnique({
    where: { id: shiftId, studentId: student.id },
    select: { patternId: true, startAt: true, updatedAt: true },
  })
  if (!row) fail('shift_not_found')
  if (op && row.updatedAt.getTime() !== op.baseUpdatedAt?.getTime()) fail('changed_on_server')
  if (row.patternId === null) {
    await prisma.shift.delete({ where: { id: shiftId, studentId: student.id } })
    return { removed: 'deleted' as const }
  }
  const day = localDayRange(utcToZoned(row.startAt, student.timezone).date, student.timezone)
  await prisma.shift.update({
    where: { id: shiftId, studentId: student.id },
    data: {
      type: 'off',
      startAt: day.start,
      endAt: day.end,
      sleepMinutes: 0,
      overridden: true,
      ...(op && { clientOpId: op.opId }),
    },
  })
  return { removed: 'off' as const }
}

/** The shift a replayed op created, if it was already applied (spec 008 research R7). */
export async function shiftCreatedBy(studentId: string, opId: string) {
  const row = await prisma.shift.findFirst({
    where: { studentId, clientOpId: opId },
    select: shiftSelect,
  })
  return row && toView(row)
}

/** A shift's version and last offline op, or null when it's gone (spec 008 research R7). */
export function shiftVersion(studentId: string, shiftId: string) {
  return prisma.shift.findUnique({
    where: { id: shiftId, studentId },
    select: { updatedAt: true, clientOpId: true },
  })
}

/** GET /api/shifts/[shiftId]: 404 shift_not_found when it isn't the caller's. */
export async function getShift(student: { id: string }, shiftId: string) {
  const row = await prisma.shift.findUnique({
    where: { id: shiftId, studentId: student.id },
    select: shiftSelect,
  })
  if (!row) throw new NotFound('shift_not_found')
  return { shift: toView(row) }
}

/**
 * GET /api/shifts?month=: the month's shifts from the day before to the day after (an overnight
 * shift from the last day of the previous month shows its "→07"), with the merged busy segments for
 * the same range (research R6). Three queries in parallel; the selected day needs no more.
 */
export async function getMonthShifts(
  student: { id: string; timezone: string },
  month: string,
): Promise<MonthShifts> {
  const { id, timezone } = student
  const dates = datesOfMonth(month)
  const from = startOfLocalDay(addCalendarDays(dates[0], -1), timezone)
  const to = startOfLocalDay(addCalendarDays(dates[dates.length - 1], 2), timezone)
  const [rows, segments, any] = await Promise.all([
    prisma.shift.findMany({
      where: { studentId: id, startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: 'asc' },
      select: shiftSelect,
    }),
    getBusySegments(id, from, to),
    prisma.shift.findFirst({ where: { studentId: id }, select: { id: true } }),
  ])
  return {
    month,
    today: todayIn(timezone),
    timeZone: timezone,
    shifts: rows.map(toView),
    segments: segments.map((s) => ({
      kind: s.kind,
      start: s.start.toISOString(),
      end: s.end.toISOString(),
    })),
    hasShifts: any !== null,
  }
}

const settingsSelect = {
  shiftPresets: true,
  sleepMinutes: true,
  wakingStart: true,
  wakingEnd: true,
  afterShiftBuffer: true,
} satisfies Prisma.ProfileSelect

function toSettings(profile: Prisma.ProfileGetPayload<{ select: typeof settingsSelect }>) {
  return {
    presets: shiftPresetsSchema.parse(profile.shiftPresets),
    sleepMinutes: profile.sleepMinutes,
    wakingStart: toClock(profile.wakingStart),
    wakingEnd: toClock(profile.wakingEnd),
    afterShiftBuffer: profile.afterShiftBuffer,
  } satisfies ShiftSettings
}

/**
 * GET /api/shifts/settings (research R3, R10; data-model.md Profile.shift_presets,
 * Profile.sleep_minutes, Profile.waking_start, Profile.waking_end, and Profile.after_shift_buffer
 * read-only) and the active rotation, if any.
 */
export async function getShiftSettings(student: { id: string }): Promise<ShiftSettingsResponse> {
  const [profile, rotation] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: student.id }, select: settingsSelect }),
    prisma.shiftPattern.findFirst({
      where: { studentId: student.id, active: true },
      select: { sequence: true, startDate: true, generatedUntil: true },
    }),
  ])
  return {
    settings: toSettings(profile),
    rotation: rotation && {
      sequence: rotation.sequence,
      startDate: rotation.startDate.toISOString().slice(0, 10),
      generatedUntil: rotation.generatedUntil?.toISOString().slice(0, 10) ?? null,
    },
  }
}

/**
 * Save preset times, sleep length and waking hours (FR-002–FR-004). data-model.md
 * Profile.after_shift_buffer, Profile.quiet_start and Profile.quiet_end are left untouched (the
 * buffer isn't edited in 005; quiet hours are 006's).
 */
export async function saveShiftSettings(student: { id: string }, input: ShiftSettingsInput) {
  const profile = await prisma.profile.update({
    where: { id: student.id },
    data: {
      shiftPresets: input.presets,
      sleepMinutes: input.sleepMinutes,
      wakingStart: fromClock(input.wakingStart),
      wakingEnd: fromClock(input.wakingEnd),
    },
    select: settingsSelect,
  })
  return { settings: toSettings(profile) }
}

/** How far ahead Today looks for the next free time (contracts/route-handlers.md). */
const FREE_HORIZON_MS = 2 * 86_400_000

/**
 * Today's shift banner (research R7) and the Me row's count (research R10): the running or next
 * working shift of local today, free now or the next free time, and this week's working shifts.
 */
export async function getTodayBanner(
  student: { id: string; timezone: string },
  now = new Date(),
): Promise<TodayBanner> {
  const { id, timezone } = student
  const today = todayIn(timezone, now)
  const monday = mondayOf(today)
  const [next, segments, weekShifts] = await Promise.all([
    // Shifts never overlap, so the earliest working shift not yet ended is the running or next one.
    prisma.shift.findFirst({
      where: {
        studentId: id,
        type: { not: 'off' },
        endAt: { gt: now },
        startAt: { lt: localDayRange(today, timezone).end },
      },
      orderBy: { startAt: 'asc' },
      select: { type: true, startAt: true, endAt: true },
    }),
    getBusySegments(id, now, new Date(now.getTime() + FREE_HORIZON_MS)),
    prisma.shift.count({
      where: {
        studentId: id,
        type: { not: 'off' },
        startAt: {
          gte: startOfLocalDay(monday, timezone),
          lt: startOfLocalDay(addCalendarDays(monday, 7), timezone),
        },
      },
    }),
  ])
  const gap = freeGaps(segments, now, new Date(now.getTime() + FREE_HORIZON_MS))[0]
  return {
    shift: next && {
      type: next.type,
      startAt: next.startAt.toISOString(),
      endAt: next.endAt.toISOString(),
      running: next.startAt <= now,
    },
    free:
      gap && gap.start <= now
        ? { now: true, until: gap.end.toISOString() }
        : { now: false, nextAt: gap?.start.toISOString() ?? null },
    weekShifts,
  }
}

/**
 * GET /api/shifts/today (contracts/route-handlers.md; research R7, R9, R10): the Today banner, the
 * Me row and the Sunday check, judged with the server's clock here and again with the device's in
 * the browser.
 */
export async function getShiftsToday(
  student: { id: string; timezone: string },
  now = new Date(),
): Promise<ShiftsToday> {
  const [profile, any, banner] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: student.id },
      select: { shiftsConfirmedWeek: true },
    }),
    prisma.shift.findFirst({ where: { studentId: student.id }, select: { id: true } }),
    getTodayBanner(student, now),
  ])
  const confirmedWeek = profile.shiftsConfirmedWeek?.toISOString().slice(0, 10) ?? null
  const hasShifts = any !== null
  return {
    ...banner,
    now: now.toISOString(),
    timeZone: student.timezone,
    confirmedWeek,
    hasShifts,
    weekCheck: weekCheck({ now, timeZone: student.timezone, confirmedWeek, hasShifts }),
  }
}
