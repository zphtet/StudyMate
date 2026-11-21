import 'server-only'
import { prisma } from '@/lib/prisma'
import { calendarDaysBetween, localDayRange, todayIn } from '@/lib/time'
import { deadlineStatus, effectiveDue } from './status'
import type { Today, TodayItem } from './types'

// What a student sees as due and late (spec 003 US3; research R11). Callers MUST have run
// requireRole('student'); every query has `studentId` in its `where`. Only Published, non-deleted
// lessons of Active, non-deleted courses with an active assignment count (FR-006).

type Student = { id: string; timezone: string }

const countingCourse = (studentId: string) => ({
  status: 'active' as const,
  deletedAt: null,
  assignments: { some: { studentId, status: 'active' } },
})

/**
 * The student's course deadlines (active assignments of counting courses) and own lesson deadlines
 * (counting lessons only), in two queries. Optionally for one course. Hidden lessons keep their
 * deadline rows, so restoring or republishing a lesson brings its deadline back (spec Edge Cases).
 */
export async function loadDeadlineFacts(studentId: string, courseId?: string) {
  const course = { ...countingCourse(studentId), ...(courseId && { id: courseId }) }
  const [assignments, deadlines] = await Promise.all([
    prisma.courseAssignment.findMany({
      where: { studentId, status: 'active', course },
      select: { courseId: true, dueAt: true },
    }),
    prisma.lessonDeadline.findMany({
      where: { studentId, lesson: { status: 'published', deletedAt: null, course } },
      select: { lessonId: true, dueAt: true },
    }),
  ])
  const courseDue = new Map(assignments.map((a) => [a.courseId, a.dueAt]))
  const lessonDue = new Map(deadlines.map((d) => [d.lessonId, d.dueAt]))
  return {
    /** Course deadline of a counting course (null = none); missing for other courses. */
    courseDue,
    /** The student's own deadlines on counting lessons. */
    lessonDue,
    /** Effective deadline of a lesson (FR-004); null outside counting courses. */
    dueOf: (lesson: { id: string; courseId: string }) =>
      courseDue.has(lesson.courseId)
        ? effectiveDue(lessonDue.get(lesson.id), courseDue.get(lesson.courseId))
        : null,
  }
}

/**
 * Today (contracts/route-handlers.md › GET /api/today): overdue oldest first, then not-done lessons
 * due later today in the student's zone, earliest first. Locks don't matter here: overdue and due
 * soon come before locked in FR-005's order.
 */
export async function getToday(student: Student, now = new Date()): Promise<Today> {
  const facts = await loadDeadlineFacts(student.id)
  const endOfToday = localDayRange(todayIn(student.timezone, now), student.timezone).end
  const isDueByTonight = (due: Date | null) => due !== null && due < endOfToday
  // Candidates: lessons with their own deadline by tonight, or in a course due by tonight. A lesson
  // deadline that moves a lesson later is applied below with dueOf().
  const lessonIds = [...facts.lessonDue].filter(([, due]) => isDueByTonight(due)).map(([id]) => id)
  const courseIds = [...facts.courseDue].filter(([, due]) => isDueByTonight(due)).map(([id]) => id)
  if (lessonIds.length === 0 && courseIds.length === 0) return { overdue: [], dueToday: [] }

  const lessons = await prisma.lesson.findMany({
    where: {
      status: 'published',
      deletedAt: null,
      course: countingCourse(student.id),
      OR: [{ id: { in: lessonIds } }, { courseId: { in: courseIds } }],
      progress: { none: { studentId: student.id, status: 'done' } },
    },
    select: {
      id: true,
      title: true,
      estMinutes: true,
      courseId: true,
      course: { select: { title: true } },
    },
  })

  const items = lessons.flatMap((lesson): TodayItem[] => {
    const dueAt = facts.dueOf(lesson)
    if (!dueAt) return []
    const due = deadlineStatus({
      dueAt,
      done: false,
      locked: false,
      now,
      timeZone: student.timezone,
    })
    const isToday = calendarDaysBetween(now, dueAt, student.timezone) === 0
    if (due.status !== 'overdue' && !(due.status === 'due_soon' && isToday)) return []
    return [
      {
        lessonId: lesson.id,
        title: lesson.title,
        estMinutes: lesson.estMinutes,
        courseId: lesson.courseId,
        courseTitle: lesson.course.title,
        due: { dueAt: dueAt.toISOString(), ...due },
      },
    ]
  })
  const byDue = (a: TodayItem, b: TodayItem) =>
    a.due.dueAt.localeCompare(b.due.dueAt) || a.title.localeCompare(b.title)
  return {
    overdue: items.filter((i) => i.due.status === 'overdue').sort(byDue),
    dueToday: items.filter((i) => i.due.status === 'due_soon').sort(byDue),
  }
}
