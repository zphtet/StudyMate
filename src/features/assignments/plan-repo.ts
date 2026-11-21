import 'server-only'
import { clashAt, displaySegments, mergeSegments, suggestSlot, type Busy } from '@/lib/availability'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { addCalendarDays, localDayRange, mondayOf, todayIn, utcToZoned } from '@/lib/time'
import { courseDeadlineStatus, deadlineStatus } from './status'
import type { Clash, PlanCard, PlanWeek } from './types'

// Busy time and clashes for the Plan and the deadline pickers (spec 003 FR-009, research R7).
// Callers MUST have run requireAdminOf(studentId). busy_segments() allows server connections
// (auth.uid() is null; docs/technical-spec.md §6.3), so the guard is the access rule here.

const DAY_MS = 86_400_000

/** Shift / Sleep segments in [from, to), merged and disjoint (one busy_segments call). */
export async function getBusySegments(studentId: string, from: Date, to: Date): Promise<Busy[]> {
  const rows = await prisma.$queryRaw<{ kind: string; start_at: Date; end_at: Date }[]>`
    select kind, start_at, end_at
    from public.busy_segments(${studentId}::uuid, ${from}::timestamptz, ${to}::timestamptz)`
  return mergeSegments(
    displaySegments(rows.map((r) => ({ kind: r.kind, start: r.start_at, end: r.end_at }))),
  )
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
  const student = await prisma.profile.findUnique({
    where: { id: studentId },
    select: { timezone: true },
  })
  if (!student) throw new NotFound('student_not_found')
  // A day before covers a shift that started earlier; 8 days after covers the 7-day search.
  const segments = await getBusySegments(
    studentId,
    new Date(at.getTime() - DAY_MS),
    new Date(at.getTime() + 8 * DAY_MS),
  )
  const kind = clashAt(segments, at)
  if (!kind) return null
  const suggestion = suggestSlot({ segments, after: at, minutes, timeZone: student.timezone })
  return { kind, suggestion: suggestion?.toISOString() ?? null }
}

const countingCourse = (adminId: string, studentId: string) => ({
  ownerId: adminId,
  status: 'active' as const,
  deletedAt: null,
  assignments: { some: { studentId, status: 'active' } },
})

/**
 * The Plan week (contracts/route-handlers.md › GET /api/admin/plan): 7 student-local days from
 * `week` (a Monday; default this week in the student's zone). Lesson cards are lessons with their
 * OWN deadline; course deadlines are one card per course (US4 scenario 4). Only counting lessons and
 * courses (FR-006). Locked and upcoming look the same on the Plan, so 002 locks aren't loaded.
 * Availability segments and clashes come with US4.
 */
export async function getPlanWeek({
  admin,
  studentId,
  week,
  now = new Date(),
}: {
  admin: { id: string; timezone: string }
  studentId: string
  week?: string | null
  now?: Date
}): Promise<PlanWeek> {
  const student = await prisma.profile.findUnique({
    where: { id: studentId },
    select: { id: true, displayName: true, timezone: true },
  })
  if (!student) throw new NotFound('student_not_found')
  const timeZone = student.timezone
  const monday = week ?? mondayOf(todayIn(timeZone, now))
  const dates = Array.from({ length: 7 }, (_, i) => addCalendarDays(monday, i))
  const from = localDayRange(dates[0], timeZone).start
  const to = localDayRange(dates[6], timeZone).end
  const course = countingCourse(admin.id, student.id)

  const [deadlines, assignments] = await Promise.all([
    prisma.lessonDeadline.findMany({
      where: {
        studentId: student.id,
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
            progress: {
              where: { studentId: student.id, status: 'done' },
              select: { lessonId: true },
            },
          },
        },
      },
    }),
    prisma.courseAssignment.findMany({
      where: { studentId: student.id, status: 'active', dueAt: { gte: from, lt: to }, course },
      select: {
        dueAt: true,
        course: {
          select: {
            id: true,
            title: true,
            lessons: {
              where: { status: 'published', deletedAt: null },
              select: {
                progress: {
                  where: { studentId: student.id, status: 'done' },
                  select: { lessonId: true },
                },
              },
            },
          },
        },
      },
    }),
  ])

  const timing = { now, timeZone }
  const lessonCards = deadlines.map(({ dueAt, lesson }): PlanCard => {
    const done = lesson.progress.length > 0
    return {
      kind: 'lesson',
      id: lesson.id,
      courseId: lesson.courseId,
      title: lesson.title,
      courseTitle: lesson.course.title,
      estMinutes: lesson.estMinutes,
      due: {
        dueAt: dueAt.toISOString(),
        ...deadlineStatus({ ...timing, dueAt, done, locked: false }),
      },
      clash: null,
      draggable: !done,
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
  const cards = [...lessonCards, ...courseCards].sort((a, b) =>
    a.due.dueAt.localeCompare(b.due.dueAt),
  )

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
        segments: [],
        cards: cards.filter((card) => utcToZoned(card.due.dueAt, timeZone).date === date),
      }
    }),
  }
}
