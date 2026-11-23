import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { fail } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import { addCalendarDays, mondayOf, startOfLocalDay, todayIn, utcToZoned } from '@/lib/time'
import { settleNotice } from '@/server/notifications/record'
import { rotationDays, type GeneratedShift, type RotationDay } from './rotation'
import { shiftPresetsSchema, type ShiftPresets } from './schemas'

// Spec 005 rotations (US2; research R4; FR-007, FR-010; data-model.md › Lifecycles). A rotation is
// stored as concrete shift rows 8 weeks ahead (one record per shift everywhere), topped up daily.
// Callers MUST have run requireRole('student'); data-model.md ShiftPattern.student_id is the caller.
// The cron top-up runs without a user (CRON_SECRET; plan.md › Complexity Tracking).

/** 8 weeks ahead (US2 scenario 1). */
const HORIZON_DAYS = 56
/** Writes up to 57 rows plus lookups over a remote database: more than Prisma's 5 s default. */
const TX = { timeout: 30_000, maxWait: 10_000 }

type Db = Prisma.TransactionClient
type Profile = { timezone: string; sleepMinutes: number; presets: ShiftPresets }
type Pattern = { id: string; sequence: string; startDate: string }

/** `@db.Date` columns hold a calendar date as UTC midnight. */
const asDate = (date: string) => new Date(`${date}T00:00:00Z`)
const dateOf = (value: Date) => value.toISOString().slice(0, 10)

async function profileOf(db: Db, studentId: string): Promise<Profile> {
  const profile = await db.profile.findUniqueOrThrow({
    where: { id: studentId },
    select: { timezone: true, sleepMinutes: true, shiftPresets: true },
  })
  return { ...profile, presets: shiftPresetsSchema.parse(profile.shiftPresets) }
}

/** FR-007: a change or delete removes the rotation's untouched shifts that haven't started. */
async function removeUntouched(db: Db, patternId: string, now: Date) {
  const { count } = await db.shift.deleteMany({
    where: { patternId, overridden: false, startAt: { gt: now } },
  })
  return count
}

const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) =>
  a.start < b.end && b.start < a.end

/**
 * Inserts the rotation's shifts for [from, to] in one statement, skipping (data-model.md ›
 * Lifecycles): a date that already has one of the student's own shifts (hand-entered or edited, any
 * type, from any rotation), a shift that would overlap a working shift, and a shift that would start
 * at or before `now`. `skippedDays` are the dates the student's own shifts kept.
 */
async function generate(
  db: Db,
  {
    studentId,
    pattern,
    profile,
    from,
    to,
    now,
  }: {
    studentId: string
    pattern: Pattern
    profile: Profile
    from: string
    to: string
    now: Date
  },
) {
  const days = rotationDays(pattern, profile.presets, profile.timezone, from, to).filter(
    (d): d is RotationDay & { shift: NonNullable<RotationDay['shift']> } =>
      d.shift !== null && d.shift.start > now,
  )
  if (days.length === 0) return { inserted: 0, skippedDays: [] }

  const existing = await db.shift.findMany({
    where: {
      studentId,
      startAt: { lt: days[days.length - 1].shift.end },
      endAt: { gt: startOfLocalDay(days[0].date, profile.timezone) },
    },
    select: { type: true, startAt: true, endAt: true, patternId: true, overridden: true },
  })
  const isOwn = (row: (typeof existing)[number]) => row.patternId === null || row.overridden
  const ownDates = new Set(
    existing.filter(isOwn).map((row) => utcToZoned(row.startAt, profile.timezone).date),
  )
  const working = existing
    .filter((row) => row.type !== 'off')
    .map((row) => ({ start: row.startAt, end: row.endAt, isOwn: isOwn(row) }))

  const accepted: (GeneratedShift & { date: string })[] = []
  const skippedDays = new Set<string>()
  for (const { date, shift } of days) {
    if (ownDates.has(date)) {
      skippedDays.add(date)
      continue
    }
    const clash = [...working, ...accepted.map((a) => ({ ...a, isOwn: false }))].find((w) =>
      overlaps(w, shift),
    )
    if (clash) {
      if (clash.isOwn) skippedDays.add(date)
      continue
    }
    accepted.push({ date, ...shift })
  }

  await db.shift.createMany({
    data: accepted.map((s) => ({
      studentId,
      type: s.type,
      startAt: s.start,
      endAt: s.end,
      sleepMinutes: s.blockSleep ? profile.sleepMinutes : 0,
      patternId: pattern.id,
    })),
  })
  return { inserted: accepted.length, skippedDays: [...skippedDays].sort() }
}

/**
 * Save the student's rotation (US2 scenario 1; FR-010): the active one, if any, is replaced (its
 * untouched shifts that haven't started are removed, FR-007), then the new one is generated from
 * its start date or today, whichever is later, to today + 56 days. One transaction.
 */
export async function saveRotation(
  student: { id: string },
  input: { sequence: string; startDate: string },
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const profile = await profileOf(tx, student.id)
    const today = todayIn(profile.timezone, now)
    const until = addCalendarDays(today, HORIZON_DAYS)
    const old = await tx.shiftPattern.findFirst({
      where: { studentId: student.id, active: true },
      select: { id: true },
    })
    if (old) {
      await removeUntouched(tx, old.id, now)
      await tx.shiftPattern.update({ where: { id: old.id }, data: { active: false } })
    }
    const created = await tx.shiftPattern.create({
      data: {
        studentId: student.id,
        sequence: input.sequence,
        startDate: asDate(input.startDate),
        generatedUntil: asDate(until),
      },
      select: { id: true },
    })
    const { skippedDays } = await generate(tx, {
      studentId: student.id,
      pattern: { id: created.id, ...input },
      profile,
      from: input.startDate > today ? input.startDate : today,
      to: until,
      now,
    })
    return { generatedUntil: until, skippedDays }
  }, TX)
}

/** Delete the rotation (US2 scenario 4): its untouched shifts that haven't started go too. */
export async function deleteRotation(student: { id: string }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const active = await tx.shiftPattern.findFirst({
      where: { studentId: student.id, active: true },
      select: { id: true },
    })
    if (!active) fail('rotation_not_found')
    const removed = await removeUntouched(tx, active.id, now)
    await tx.shiftPattern.update({ where: { id: active.id }, data: { active: false } })
    return { removed }
  }, TX)
}

/**
 * Generate the active rotation's untouched future shifts again, e.g. after new preset times or a new
 * sleep length (spec Edge Cases; FR-002): the same rule as a rotation change.
 */
export async function regenerateFuture(student: { id: string }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const active = await tx.shiftPattern.findFirst({
      where: { studentId: student.id, active: true },
      select: { id: true, sequence: true, startDate: true },
    })
    if (!active) return { inserted: 0 }
    const profile = await profileOf(tx, student.id)
    const today = todayIn(profile.timezone, now)
    const until = addCalendarDays(today, HORIZON_DAYS)
    const startDate = dateOf(active.startDate)
    await removeUntouched(tx, active.id, now)
    const { inserted } = await generate(tx, {
      studentId: student.id,
      pattern: { id: active.id, sequence: active.sequence, startDate },
      profile,
      from: startDate > today ? startDate : today,
      to: until,
      now,
    })
    await tx.shiftPattern.update({
      where: { id: active.id },
      data: { generatedUntil: asDate(until) },
    })
    return { inserted }
  }, TX)
}

/**
 * The daily cron (GET /api/cron/rotations): extends every active rotation from the day after
 * `generated_until` to the student's today + 56. Idempotent: a second run on the same day inserts 0.
 */
export async function topUpRotations(now = new Date()) {
  const patterns = await prisma.shiftPattern.findMany({
    where: { active: true },
    select: {
      id: true,
      studentId: true,
      sequence: true,
      startDate: true,
      generatedUntil: true,
      student: { select: { timezone: true, sleepMinutes: true, shiftPresets: true } },
    },
  })
  let inserted = 0
  for (const pattern of patterns) {
    const { timezone, sleepMinutes, shiftPresets } = pattern.student
    const today = todayIn(timezone, now)
    const until = addCalendarDays(today, HORIZON_DAYS)
    const startDate = dateOf(pattern.startDate)
    const next = pattern.generatedUntil
      ? addCalendarDays(dateOf(pattern.generatedUntil), 1)
      : startDate
    const from = [next, startDate, today].sort().at(-1) ?? today
    if (from > until) continue
    inserted += await prisma.$transaction(async (tx) => {
      const result = await generate(tx, {
        studentId: pattern.studentId,
        pattern: { id: pattern.id, sequence: pattern.sequence, startDate },
        profile: { timezone, sleepMinutes, presets: shiftPresetsSchema.parse(shiftPresets) },
        from,
        to: until,
        now,
      })
      await tx.shiftPattern.update({
        where: { id: pattern.id },
        data: { generatedUntil: asDate(until) },
      })
      return result.inserted
    }, TX)
  }
  return { rotations: patterns.length, inserted }
}

/**
 * The Sunday check's Confirm and Edit (FR-009; research R9): the coming Monday in the student's zone
 * (data-model.md Profile.shifts_confirmed_week), and the check's notification answered (006 FR-010).
 * Idempotent.
 */
export async function confirmShiftWeek(student: { id: string }, now = new Date()) {
  const { timezone } = await prisma.profile.findUniqueOrThrow({
    where: { id: student.id },
    select: { timezone: true },
  })
  const week = addCalendarDays(mondayOf(todayIn(timezone, now)), 7)
  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: student.id },
      data: { shiftsConfirmedWeek: asDate(week) },
    })
    // 006 FR-010: answering the check also answers its notification.
    await settleNotice(
      { userId: student.id, sourceId: student.id, occurrenceKey: `week-check@${week}` },
      tx,
    )
  })
  return { week }
}
