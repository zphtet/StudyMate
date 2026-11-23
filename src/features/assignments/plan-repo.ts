import 'server-only'
import { clashAt, suggestSlot, type Busy } from '@/lib/availability'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { getBusySegments } from '@/server/availability'
import {
  addCalendarDays,
  datesOfMonth,
  localDayRange,
  mondayOf,
  todayIn,
  utcToZoned,
} from '@/lib/time'
import { courseDeadlineStatus, deadlineStatus } from './status'
import type { Clash, PlanCard, PlanMonth, PlanWeek, Segment, StudentRef } from './types'

// Busy time and clashes for the Plan and the deadline pickers (spec 003 FR-009, research R7).
// Callers MUST have run requireAdminOf(studentId). busy_segments() allows server connections
// (auth.uid() is null; docs/technical-spec.md §6.3), so the guard is the access rule here.

const DAY_MS = 86_400_000

/** Shift or sleep at `at`, and where "Move to …" would put it (spec 003 FR-009). */
function clashIn({
  segments,
  at,
  minutes,
  timeZone,
}: {
  segments: readonly Busy[]
  at: Date
  minutes: number
  timeZone: string
}): Clash | null {
  const kind = clashAt(segments, at)
  if (!kind) return null
  const suggestion = suggestSlot({ segments, after: at, minutes, timeZone })
  return { kind, suggestion: suggestion?.toISOString() ?? null }
}

/**
 * Whether a future deadline at `at` falls inside the student's shift or sleep, and where "Move to …"
 * would put it (`minutes` of free time, at least 60). Past times never clash: they are "Already
 * overdue" instead.
 */
export async function clashFor(
  studentId: string,
  at: Date,
  minutes: number,
): Promise<Clash | null> {
  if (at.getTime() <= Date.now()) return null
  const student = await loadStudent(studentId)
  // A day before covers a shift that started earlier; 8 days after covers the 7-day search.
  const segments = await getBusySegments(
    studentId,
    new Date(at.getTime() - DAY_MS),
    new Date(at.getTime() + 8 * DAY_MS),
  )
  return clashIn({ segments, at, minutes, timeZone: student.timezone })
}

async function loadStudent(studentId: string) {
  const student = await prisma.profile.findUnique({
    where: { id: studentId },
    select: { id: true, displayName: true, timezone: true },
  })
  if (!student) throw new NotFound('student_not_found')
  return student
}

const countingCourse = (adminId: string, studentId: string) => ({
  ownerId: adminId,
  status: 'active' as const,
  deletedAt: null,
  assignments: { some: { studentId, status: 'active' } },
})

type Range = {
  adminId: string
  studentId: string
  from: Date
  to: Date
  now: Date
  timeZone: string
}

/**
 * Cards due in [from, to), ordered by dueAt, without clashes. Lesson cards are lessons with their
 * OWN deadline; course deadlines are one card per course (US4 scenario 4). Only counting lessons and
 * courses (FR-006). Locked and upcoming look the same on the Plan, so 002 locks aren't loaded.
 */
async function loadCards({
  adminId,
  studentId,
  from,
  to,
  now,
  timeZone,
}: Range): Promise<PlanCard[]> {
  const course = countingCourse(adminId, studentId)
  const done = { where: { studentId, status: 'done' as const }, select: { lessonId: true } }
  const [deadlines, assignments] = await Promise.all([
    prisma.lessonDeadline.findMany({
      where: {
        studentId,
        dueAt: { gte: from, lt: to },
        lesson: { status: 'published', deletedAt: null, course },
      },
      select: {
        dueAt: true,
        lesson: {
          select: {
            id: true,
            title: true,
            estMinutes: true,
            courseId: true,
            course: { select: { title: true } },
            progress: done,
          },
        },
      },
    }),
    prisma.courseAssignment.findMany({
      where: { studentId, status: 'active', dueAt: { gte: from, lt: to }, course },
      select: {
        dueAt: true,
        course: {
          select: {
            id: true,
            title: true,
            lessons: {
              where: { status: 'published', deletedAt: null },
              select: { progress: done },
            },
          },
        },
      },
    }),
  ])

  const timing = { now, timeZone }
  const lessonCards = deadlines.map(({ dueAt, lesson }): PlanCard => {
    const isDone = lesson.progress.length > 0
    return {
      kind: 'lesson',
      id: lesson.id,
      courseId: lesson.courseId,
      title: lesson.title,
      courseTitle: lesson.course.title,
      estMinutes: lesson.estMinutes,
      due: {
        dueAt: dueAt.toISOString(),
        ...deadlineStatus({ ...timing, dueAt, done: isDone, locked: false }),
      },
      clash: null,
      draggable: !isDone,
    }
  })
  const courseCards = assignments.flatMap(({ dueAt, course: c }): PlanCard[] => {
    if (!dueAt) return []
    const status = courseDeadlineStatus({
      ...timing,
      dueAt,
      lessonCount: c.lessons.length,
      doneCount: c.lessons.filter((l) => l.progress.length > 0).length,
    })
    return [
      {
        kind: 'course',
        id: c.id,
        courseId: c.id,
        title: c.title,
        courseTitle: c.title,
        estMinutes: null,
        due: { dueAt: dueAt.toISOString(), ...status },
        clash: null,
        draggable: status.status !== 'done',
      },
    ]
  })
  return [...lessonCards, ...courseCards].sort((a, b) => a.due.dueAt.localeCompare(b.due.dueAt))
}

/** Busy segments cut to one local day, for its bar. */
function clipTo(segments: readonly Busy[], start: Date, end: Date): Segment[] {
  return segments.flatMap((s) => {
    const from = s.start > start ? s.start : start
    const to = s.end < end ? s.end : end
    return from < to ? [{ kind: s.kind, start: from.toISOString(), end: to.toISOString() }] : []
  })
}

/** Lessons leave their estimated minutes free (at least 60, in suggestSlot); courses an hour. */
const COURSE_MINUTES = 60

/**
 * The Plan week (contracts/route-handlers.md › GET /api/admin/plan): 7 student-local days from
 * `week` (a Monday; default this week in the student's zone), each with its Shift/Sleep segments and
 * cards. Not-done future cards inside a shift or sleep carry the clash and its "Move to …" time
 * (spec 003 US4, FR-009, research R7).
 */
export async function getPlanWeek({
  admin,
  studentId,
  student: known,
  week,
  now = new Date(),
}: {
  admin: { id: string; timezone: string }
  studentId: string
  /** The student's row when the caller already has it (the page seed): saves a round trip. */
  student?: StudentRef
  week?: string | null
  now?: Date
}): Promise<PlanWeek> {
  const student = known?.id === studentId ? known : await loadStudent(studentId)
  const timeZone = student.timezone
  const monday = week ?? mondayOf(todayIn(timeZone, now))
  const dates = Array.from({ length: 7 }, (_, i) => addCalendarDays(monday, i))
  const from = localDayRange(dates[0], timeZone).start
  const to = localDayRange(dates[6], timeZone).end

  // One busy_segments call: a day before for a shift already running, 8 days after for the 7-day
  // "Move to …" search from Sunday's cards.
  const [cards, segments] = await Promise.all([
    loadCards({ adminId: admin.id, studentId, from, to, now, timeZone }),
    getBusySegments(
      studentId,
      new Date(from.getTime() - DAY_MS),
      new Date(to.getTime() + 8 * DAY_MS),
    ),
  ])
  const withClash = (card: PlanCard): PlanCard => {
    const at = new Date(card.due.dueAt)
    if (card.due.status === 'done' || at <= now) return card
    const minutes = card.estMinutes ?? COURSE_MINUTES
    return { ...card, clash: clashIn({ segments, at, minutes, timeZone }) }
  }

  return {
    student,
    adminTimezone: admin.timezone,
    now: now.toISOString(),
    days: dates.map((date) => {
      const { start, end } = localDayRange(date, timeZone)
      return {
        date,
        start: start.toISOString(),
        end: end.toISOString(),
        segments: clipTo(segments, start, end),
        cards: cards
          .filter((card) => utcToZoned(card.due.dueAt, timeZone).date === date)
          .map(withClash),
      }
    }),
  }
}

/**
 * The Plan month (contracts/route-handlers.md › GET /api/admin/plan/month; spec 003 FR-010): cards
 * and late (overdue) cards per student-local day, only days with at least one card. `month` null =
 * this month in the student's zone.
 */
export async function getPlanMonth({
  admin,
  studentId,
  month,
  now = new Date(),
}: {
  admin: { id: string }
  studentId: string
  month: string | null
  now?: Date
}): Promise<PlanMonth> {
  const student = await loadStudent(studentId)
  const timeZone = student.timezone
  const shown = month ?? todayIn(timeZone, now).slice(0, 7)
  const dates = datesOfMonth(shown)
  const cards = await loadCards({
    adminId: admin.id,
    studentId,
    from: localDayRange(dates[0], timeZone).start,
    to: localDayRange(dates.at(-1) ?? dates[0], timeZone).end,
    now,
    timeZone,
  })
  const byDate = new Map<string, { date: string; count: number; late: number }>()
  for (const card of cards) {
    const date = utcToZoned(card.due.dueAt, timeZone).date
    const day = byDate.get(date) ?? { date, count: 0, late: 0 }
    day.count += 1
    if (card.due.status === 'overdue') day.late += 1
    byDate.set(date, day)
  }
  return { student, month: shown, days: [...byDate.values()] }
}
