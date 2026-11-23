import type { RuleTrigger } from '@/generated/prisma/enums'
import type { RuleConfig } from '@/lib/notifications/rule-config'
import { activeDates, type DayActivity } from '@/lib/streak'
import {
  addCalendarDays,
  localDayRange,
  mondayOf,
  todayIn,
  utcToZoned,
  zonedToUtc,
} from '@/lib/time'
import { weekFacts } from '@/server/activity'

// When a rule fires (spec 006 research R3): for one rule and one student, the occurrences in a
// dispatcher window, each with its instant, occurrence key, lapse time (FR-017) and the facts its
// text needs. All times are read in the student's zone. Pure: the dispatcher loads the data in
// batches (rule-data.ts) and renders the text (rule-rows.ts). Keys: data-model.md › Occurrence keys.

/** `(from, to]`: the dispatcher looks back 15 minutes so a late or missed tick loses nothing (R2). */
export type Window = { from: Date; to: Date }

/** A lesson of an active assignment, with its effective deadline (003 FR-004) and completion (004). */
export type AssignedLesson = {
  lessonId: string
  lesson: string
  course: string
  dueAt: Date | null
  completed: boolean
}

/** A working shift that ended, and when the student's next working shift starts. */
export type EndedShift = { id: string; endAt: Date; nextStartAt: Date | null }

export type StudentData = {
  lessons: AssignedLesson[]
  /** Days with any activity, in the student's zone (src/server/activity.ts). */
  activity: DayActivity[]
  shifts: EndedShift[]
}

/** The weekly summary's facts (FR-019). */
export type WeekSummary = {
  lessonsDone: number
  studySeconds: number
  streak: number
  overdue: number
  next: { lesson: string; dueAt: Date }[]
}

export type OccurrenceValues = {
  /** due_soon, overdue */
  lessonId?: string
  lesson?: string
  course?: string
  dueAt?: Date
  /** inactive: the last active local date */
  lastActive?: string
  /** weekly_summary to the student */
  summary?: WeekSummary
  /** weekly_summary to the Admin: one line per student */
  lines?: { studentId: string; name: string; summary: WeekSummary }[]
}

export type Occurrence = {
  /** The student, or the rule's owner for `to: admin` */
  to: 'student' | 'admin'
  at: Date
  key: string
  /** null = never lapses */
  expiresAt: Date | null
  values: OccurrenceValues
}

const HOUR = 3_600_000
const MINUTE = 60_000
/** The weekly summary lists this many upcoming deadlines (FR-019). */
const NEXT_DEADLINES = 3

const isIn = (at: Date, { from, to }: Window) => at > from && at <= to

/** The local dates a window touches (one, or two across midnight). */
function datesIn({ from, to }: Window, zone: string) {
  const dates: string[] = []
  const last = todayIn(zone, to)
  for (let date = todayIn(zone, from); date <= last; date = addCalendarDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * A local date and clock time as an instant. On a spring-forward day a time that doesn't exist
 * moves to the next valid minute, the end of the gap (Edge Cases: 02:30 → 03:00 in New York).
 * On a fall-back day the time is read once.
 */
export function wallClock(date: string, time: string, zone: string): Date {
  let at = zonedToUtc(date, time, zone)
  if (utcToZoned(at, zone).time === time) return at
  for (;;) {
    const earlier = utcToZoned(new Date(at.getTime() - MINUTE), zone)
    if (earlier.date !== date || earlier.time < time) return at
    at = new Date(at.getTime() - MINUTE)
  }
}

const endOfDay = (date: string, zone: string) => localDayRange(date, zone).end

/** Every instant of `time` on `date` in the window, for the given weekdays. */
function atClock(window: Window, zone: string, time: string, weekdays?: readonly number[]) {
  return datesIn(window, zone)
    .filter((date) => !weekdays || weekdays.includes(isoWeekday(date)))
    .map((date) => ({ date, at: wallClock(date, time, zone) }))
    .filter(({ at }) => isIn(at, window))
}

const lastActiveDate = (activity: DayActivity[]) => activeDates(activity).at(-1) ?? null

/** The facts of the week that `at` falls in, in the student's zone (FR-019). */
export function weekSummary(data: StudentData, at: Date, zone: string): WeekSummary {
  const facts = weekFacts(data.activity, todayIn(zone, at))
  const open = data.lessons.filter(
    (l): l is AssignedLesson & { dueAt: Date } => !l.completed && l.dueAt !== null,
  )
  return {
    lessonsDone: facts.weekLessonsDone,
    studySeconds: facts.weekSeconds,
    streak: facts.streak.current,
    overdue: open.filter((l) => l.dueAt <= at).length,
    next: open
      .filter((l) => l.dueAt > at)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, NEXT_DEADLINES)
      .map(({ lesson, dueAt }) => ({ lesson, dueAt })),
  }
}

/** Overdue (data-model.md › Config by trigger): n = 0 at the deadline, then the next repeat times. */
function overdueInstants(dueAt: Date, repeatTime: string, max: number, zone: string) {
  const instants = [dueAt]
  let date = todayIn(zone, dueAt)
  // The first repeat is the first repeat time after the deadline (that day or the next).
  if (wallClock(date, repeatTime, zone) <= dueAt) date = addCalendarDays(date, 1)
  while (instants.length < max) {
    instants.push(wallClock(date, repeatTime, zone))
    date = addCalendarDays(date, 1)
  }
  return instants
}

const deadlineKey = (l: { lessonId: string }, dueAt: Date, n: number) =>
  `${l.lessonId}@${dueAt.toISOString()}#${n}`

const lessonValues = (l: AssignedLesson, dueAt: Date): OccurrenceValues => ({
  lessonId: l.lessonId,
  lesson: l.lesson,
  course: l.course,
  dueAt,
})

/** Open lessons with a deadline: none for completed work or work without a deadline (FR-011). */
const openWithDeadline = (lessons: AssignedLesson[]) =>
  lessons.filter((l): l is AssignedLesson & { dueAt: Date } => !l.completed && l.dueAt !== null)

/** The student's occurrences of one rule in the window (research R3 table). */
export function occurrences(
  rule: RuleConfig,
  student: { id: string; timezone: string },
  data: StudentData,
  window: Window,
): Occurrence[] {
  const zone = student.timezone
  const toStudent = (o: Omit<Occurrence, 'to'>): Occurrence => ({ to: 'student', ...o })

  switch (rule.trigger) {
    case 'daily':
      return atClock(window, zone, rule.time, rule.days).map(({ date, at }) =>
        toStudent({ at, key: date, expiresAt: endOfDay(date, zone), values: {} }),
      )

    case 'streak_risk': {
      const active = new Set(activeDates(data.activity))
      return atClock(window, zone, rule.time)
        .filter(({ date }) => !active.has(date))
        .map(({ date, at }) =>
          toStudent({ at, key: date, expiresAt: endOfDay(date, zone), values: {} }),
        )
    }

    case 'after_shift':
      return data.shifts
        .map((shift) => ({ shift, at: new Date(shift.endAt.getTime() + rule.hours * HOUR) }))
        .filter(({ at }) => isIn(at, window))
        .map(({ shift, at }) =>
          toStudent({ at, key: shift.id, expiresAt: shift.nextStartAt, values: {} }),
        )

    case 'due_soon':
      return openWithDeadline(data.lessons).flatMap((l) =>
        rule.offsets_h
          .map((hours) => ({ hours, at: new Date(l.dueAt.getTime() - hours * HOUR) }))
          .filter(({ at }) => isIn(at, window))
          .map(({ hours, at }) =>
            toStudent({
              at,
              key: deadlineKey(l, l.dueAt, hours),
              expiresAt: l.dueAt,
              values: lessonValues(l, l.dueAt),
            }),
          ),
      )

    case 'overdue':
      return openWithDeadline(data.lessons).flatMap((l) => {
        const instants = overdueInstants(l.dueAt, rule.repeat_time, rule.max, zone)
        return instants.flatMap((at, n) => {
          if (!isIn(at, window)) return []
          // Each lapses at the next repeat; the last at the end of its day (FR-017).
          const expiresAt = instants[n + 1] ?? endOfDay(todayIn(zone, at), zone)
          return [
            toStudent({
              at,
              key: deadlineKey(l, l.dueAt, n),
              expiresAt,
              values: lessonValues(l, l.dueAt),
            }),
          ]
        })
      })

    case 'inactive': {
      const last = lastActiveDate(data.activity)
      if (!last) return []
      // After `days` full local days without study: as the next day begins. Once per gap.
      const at = localDayRange(addCalendarDays(last, rule.days + 1), zone).start
      if (!isIn(at, window)) return []
      const values = { lastActive: last }
      const key = `inactive@${last}`
      return [
        ...(rule.to.includes('student') ? [toStudent({ at, key, expiresAt: null, values })] : []),
        ...(rule.to.includes('admin')
          ? [{ to: 'admin' as const, at, key: `${student.id}:${key}`, expiresAt: null, values }]
          : []),
      ]
    }

    case 'weekly_summary':
      // The Admin's copy is one combined row per rule and week (adminWeeklySummary).
      if (!rule.to.includes('student')) return []
      return atClock(window, zone, rule.time, [rule.weekday]).map(({ date, at }) =>
        toStudent({
          at,
          key: `week@${mondayOf(date)}`,
          expiresAt: null,
          values: { summary: weekSummary(data, at, zone) },
        }),
      )
  }
}

/**
 * The Admin's weekly summary for a rule sent `to: admin`: one occurrence per rule and week with one
 * line per student (FR-019; data-model.md › Occurrence keys). It covers students in several zones,
 * so it follows the Admin's own clock; each line reads that student's own week.
 */
export function adminWeeklySummary(
  rule: RuleConfig,
  admin: { timezone: string },
  students: { id: string; name: string; timezone: string; data: StudentData }[],
  window: Window,
): Occurrence | null {
  if (rule.trigger !== 'weekly_summary' || !rule.to.includes('admin')) return null
  const [hit] = atClock(window, admin.timezone, rule.time, [rule.weekday])
  if (!hit) return null
  return {
    to: 'admin',
    at: hit.at,
    key: `week@${mondayOf(hit.date)}`,
    expiresAt: null,
    values: {
      lines: students.map((s) => ({
        studentId: s.id,
        name: s.name,
        summary: weekSummary(s.data, hit.at, s.timezone),
      })),
    },
  }
}

/**
 * Whether a held rule row still applies just before delivery (research R4, FR-011): Due soon and
 * Overdue while the lesson is open and its effective deadline is the one in the key; Streak at risk
 * while that day has no activity; Inactive while there is no study after the key's date.
 */
export function stillApplies(trigger: RuleTrigger, key: string, data: StudentData): boolean {
  switch (trigger) {
    case 'due_soon':
    case 'overdue': {
      const [lessonId, rest = ''] = key.split('@')
      const dueIso = rest.split('#')[0]
      const lesson = data.lessons.find((l) => l.lessonId === lessonId)
      return !!lesson && !lesson.completed && lesson.dueAt?.toISOString() === dueIso
    }
    case 'streak_risk':
      return !activeDates(data.activity).includes(key)
    case 'inactive': {
      const since = key.slice(key.indexOf('inactive@') + 'inactive@'.length)
      const last = lastActiveDate(data.activity)
      return last === null || last <= since
    }
    default:
      return true
  }
}
