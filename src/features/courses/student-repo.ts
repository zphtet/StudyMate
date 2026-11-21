import 'server-only'
import { deadlineStatus } from '@/features/assignments/status'
import { loadDeadlineFacts } from '@/features/assignments/student-repo'
import { HttpError, NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { todayIn } from '@/lib/time'
import { toResource } from './lesson-repo'
import { computeLocks } from './lock'
import { flatten, groupCourse } from './order'
import { readUnlockRule, type CourseColor } from './schemas'
import type { LockInfo, StudentCourse, StudentCourseCard, StudentLesson } from './types'

// What students see in 002 (spec 002 US4, research.md R12; contracts/route-handlers.md › Student).
// Callers MUST have run a guard. Every query is scoped to the student's own active assignment, so a
// student sees Active and Archived courses assigned to them, and only Published, non-deleted
// lessons; Archived courses keep only the lessons that student completed (can_read_lesson).
// Spec 003 (research R11) adds the student's deadlines, overdue counts and due statuses, from
// assignments/student-repo.ts.

type Student = { id: string; timezone: string }

const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)

const readableCourse = (studentId: string) => ({
  deletedAt: null,
  status: { in: ['active' as const, 'archived' as const] },
  assignments: { some: { studentId, status: 'active' } },
})

const visibleLesson = { status: 'published' as const, deletedAt: null }

/** Today in the student's zone; an unknown zone falls back to UTC. */
function today(timezone: string, now: Date) {
  try {
    return todayIn(timezone, now)
  } catch {
    return todayIn('UTC', now)
  }
}

/** The course structure needed for order, numbers and locks. */
const structure = (studentId: string) =>
  ({
    sections: { select: { id: true, title: true, position: true } },
    lessons: {
      where: visibleLesson,
      select: {
        id: true,
        sectionId: true,
        position: true,
        title: true,
        estMinutes: true,
        status: true,
        deletedAt: true,
        unlockRule: true,
        progress: { where: { studentId, status: 'done' as const }, select: { lessonId: true } },
      },
    },
  }) as const

type Structure = {
  status: 'draft' | 'active' | 'archived'
  sections: { id: string; title: string; position: number }[]
  lessons: {
    id: string
    sectionId: string | null
    position: number
    title: string
    estMinutes: number
    status: 'draft' | 'published'
    deletedAt: Date | null
    unlockRule: unknown
    progress: { lessonId: string }[]
  }[]
}

/** Groups, course order and locks of the lessons this student can see. */
function studentView(course: Structure, student: Student, now: Date) {
  const done = new Set(course.lessons.filter((l) => l.progress.length > 0).map((l) => l.id))
  const archived = course.status === 'archived'
  const shown = archived ? course.lessons.filter((l) => done.has(l.id)) : course.lessons
  // Sections with no visible lessons are left out.
  const groups = groupCourse(course.sections, shown).filter((g) => g.lessons.length > 0)
  const ordered = flatten(groups)
  const locks = computeLocks({
    lessons: ordered.map((l) => ({ ...l, unlockRule: readUnlockRule(l.unlockRule) })),
    done,
    today: today(student.timezone, now),
    archived,
  })
  return { groups, ordered, locks, done }
}

export async function listStudentCourses(studentId: string, now = new Date()) {
  const facts = await loadDeadlineFacts(studentId)
  const courses = await prisma.course.findMany({
    where: readableCourse(studentId),
    orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }],
    select: {
      id: true,
      title: true,
      icon: true,
      color: true,
      levelTag: true,
      targetDate: true,
      status: true,
      owner: { select: { displayName: true } },
      lessons: {
        where: visibleLesson,
        select: {
          id: true,
          progress: { where: { studentId, status: 'done' }, select: { lessonId: true } },
        },
      },
    },
  })
  const card = (c: (typeof courses)[number]): StudentCourseCard => ({
    id: c.id,
    title: c.title,
    icon: c.icon,
    color: c.color as CourseColor,
    levelTag: c.levelTag,
    targetDate: isoDate(c.targetDate),
    lessonCount:
      c.status === 'archived'
        ? c.lessons.filter((l) => l.progress.length > 0).length
        : c.lessons.length,
    admin: { displayName: c.owner.displayName },
    dueAt: facts.courseDue.get(c.id)?.toISOString() ?? null,
    overdueCount: c.lessons.filter((l) => {
      const due = facts.dueOf({ id: l.id, courseId: c.id })
      return l.progress.length === 0 && due !== null && due < now
    }).length,
  })
  return {
    active: courses.filter((c) => c.status === 'active').map(card),
    archived: courses.filter((c) => c.status === 'archived').map(card),
  }
}

export async function getStudentCourse(
  student: Student,
  courseId: string,
  now = new Date(),
): Promise<StudentCourse> {
  const [course, facts] = await Promise.all([
    prisma.course.findFirst({
      where: { id: courseId, ...readableCourse(student.id) },
      select: {
        id: true,
        title: true,
        icon: true,
        color: true,
        description: true,
        targetDate: true,
        status: true,
        owner: { select: { displayName: true } },
        ...structure(student.id),
      },
    }),
    loadDeadlineFacts(student.id, courseId),
  ])
  if (!course) throw new NotFound('course_not_found')

  const { groups, ordered, locks, done } = studentView(course, student, now)
  const numbers = new Map(ordered.map((l, i) => [l.id, i + 1]))
  return {
    course: {
      id: course.id,
      title: course.title,
      icon: course.icon,
      color: course.color as CourseColor,
      description: course.description,
      targetDate: isoDate(course.targetDate),
      status: course.status === 'archived' ? 'archived' : 'active',
      admin: { displayName: course.owner.displayName },
      dueAt: facts.courseDue.get(course.id)?.toISOString() ?? null,
    },
    lessonCount: ordered.length,
    groups: groups.map((g) => ({
      section: g.section ? { id: g.section.id, title: g.section.title } : null,
      lessons: g.lessons.map((l) => {
        const lock = locks.get(l.id)!
        const dueAt = facts.dueOf({ id: l.id, courseId: course.id })
        const status = deadlineStatus({
          dueAt,
          done: done.has(l.id),
          locked: lock.state === 'locked',
          now,
          timeZone: student.timezone,
        })
        return {
          id: l.id,
          number: numbers.get(l.id)!,
          title: l.title,
          estMinutes: l.estMinutes,
          state: lock.state,
          lock: lock.lock,
          done: done.has(l.id),
          due: dueAt ? { dueAt: dueAt.toISOString(), ...status } : null,
        }
      }),
    })),
  }
}

/**
 * Where a lesson sits for this student ("Lesson n of m"), or why it can't be opened: 404
 * `lesson_not_found` when the student can't see it, 403 `lesson_locked` with the reason when it is
 * locked (research.md R1).
 */
export async function placeStudentLesson(student: Student, lessonId: string, now = new Date()) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...visibleLesson, course: readableCourse(student.id) },
    select: {
      course: { select: { id: true, title: true, status: true, ...structure(student.id) } },
    },
  })
  if (!lesson) throw new NotFound('lesson_not_found')
  const { course } = lesson
  const { ordered, locks } = studentView(course, student, now)
  const index = ordered.findIndex((l) => l.id === lessonId)
  // An Archived course keeps only completed lessons.
  if (index < 0) throw new NotFound('lesson_not_found')
  const lock = locks.get(lessonId)!
  if (lock.state === 'locked') {
    throw new HttpError(403, 'lesson_locked', {
      courseId: course.id,
      lock: lock.lock satisfies LockInfo | null,
    })
  }
  return {
    course: { id: course.id, title: course.title },
    number: index + 1,
    total: ordered.length,
  }
}

export async function getStudentLesson(
  student: Student,
  lessonId: string,
  now = new Date(),
): Promise<StudentLesson> {
  const place = await placeStudentLesson(student, lessonId, now)
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...visibleLesson, course: readableCourse(student.id) },
    select: {
      id: true,
      title: true,
      estMinutes: true,
      contentMd: true,
      assignmentPrompt: true,
      requireSubmission: true,
      resources: { where: { kind: { in: ['file', 'link'] } }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!lesson) throw new NotFound('lesson_not_found')
  return {
    id: lesson.id,
    title: lesson.title,
    estMinutes: lesson.estMinutes,
    number: place.number,
    total: place.total,
    course: place.course,
    contentMd: lesson.contentMd,
    assignmentPrompt: lesson.assignmentPrompt,
    requireSubmission: lesson.requireSubmission,
    attachments: lesson.resources.map(toResource),
  }
}
