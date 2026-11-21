import 'server-only'
import { fail } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { groupCourse, numberLessons } from './order'
import { isExpired, purgeAt, RESTORE_MS } from './retention'
import type { CourseColor, CourseFields, CourseStatus } from './schemas'
import type { AdminCourseDetail, AdminCourseList, RecentlyDeleted } from './types'

// Admin course reads and writes (spec 002 US1). Callers MUST have run a guard; every query is
// scoped by data-model.md Course.ownerId = the caller and Course.deletedAt = null.

const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)
const toDate = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null)

/** Mean course_progress.percent per course over its assigned students (research.md R10). */
async function averageProgress(courseIds: string[]) {
  if (courseIds.length === 0) return new Map<string, number>()
  const rows = await prisma.$queryRaw<{ course_id: string; avg: number | null }[]>`
    select course_id, round(avg(percent))::int as avg
    from course_progress where course_id = any(${courseIds}::uuid[]) group by course_id`
  return new Map(rows.filter((r) => r.avg !== null).map((r) => [r.course_id, r.avg!]))
}

export async function listAdminCourses(adminId: string): Promise<AdminCourseList> {
  const courses = await prisma.course.findMany({
    where: { ownerId: adminId, isPersonal: false, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      icon: true,
      color: true,
      levelTag: true,
      targetDate: true,
      status: true,
      updatedAt: true,
      _count: { select: { sections: true, lessons: { where: { deletedAt: null } } } },
      assignments: {
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { student: { select: { id: true, displayName: true } } },
      },
    },
  })
  const averages = await averageProgress(courses.map((c) => c.id))
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    icon: c.icon,
    color: c.color as CourseColor,
    levelTag: c.levelTag,
    targetDate: isoDate(c.targetDate),
    status: c.status,
    lessonCount: c._count.lessons,
    sectionCount: c._count.sections,
    students: c.assignments.map((a) => a.student),
    avgPercent: averages.get(c.id) ?? null,
    updatedAt: c.updatedAt.toISOString(),
  }))
}

export async function getAdminCourse(
  adminId: string,
  courseId: string,
): Promise<AdminCourseDetail> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, ownerId: adminId, deletedAt: null },
    include: {
      sections: { select: { id: true, title: true, position: true } },
      lessons: {
        where: { deletedAt: null },
        select: {
          id: true,
          sectionId: true,
          title: true,
          estMinutes: true,
          status: true,
          position: true,
          assignmentPrompt: true,
          resources: { where: { kind: 'audio' }, select: { id: true }, take: 1 },
        },
      },
      assignments: {
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { student: { select: { id: true, displayName: true } } },
      },
    },
  })
  if (!course) throw new NotFound('course_not_found')

  const progress = await prisma.$queryRaw<{ student_id: string; percent: number | null }[]>`
    select student_id, percent::int as percent from course_progress where course_id = ${courseId}::uuid`
  const percentOf = new Map(progress.map((p) => [p.student_id, p.percent]))

  const groups = groupCourse(course.sections, course.lessons)
  const numbers = numberLessons(groups)

  return {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      icon: course.icon,
      color: course.color as CourseColor,
      levelTag: course.levelTag,
      targetDate: isoDate(course.targetDate),
      unlockInOrder: course.unlockInOrder,
      allowStudentNotes: course.allowStudentNotes,
      status: course.status,
      lessonCount: course.lessons.length,
    },
    students: course.assignments.map(({ student }) => ({
      ...student,
      percent: percentOf.get(student.id) ?? null,
    })),
    groups: groups.map((g) => ({
      section: g.section ? { id: g.section.id, title: g.section.title } : null,
      lessons: g.lessons.map((l) => ({
        id: l.id,
        number: numbers.get(l.id)!,
        title: l.title,
        estMinutes: l.estMinutes,
        status: l.status,
        hasAssignment: !!l.assignmentPrompt,
        hasAudio: l.resources.length > 0,
      })),
    })),
  }
}

const courseData = (fields: Omit<CourseFields, 'status'>) => ({
  title: fields.title,
  description: fields.description,
  icon: fields.icon,
  color: fields.color,
  targetDate: toDate(fields.targetDate),
  levelTag: fields.levelTag,
  unlockInOrder: fields.unlockInOrder,
  allowStudentNotes: fields.allowStudentNotes,
})

export async function createCourse(adminId: string, fields: CourseFields) {
  const course = await prisma.course.create({
    data: { ownerId: adminId, isPersonal: false, status: fields.status, ...courseData(fields) },
    select: { id: true },
  })
  return { id: course.id }
}

/**
 * Edits a course. When data-model.md Course.unlockInOrder changes, every lesson whose rule is
 * `none` or `after_previous` gets the new default in the same transaction; `on_date` stays. An
 * Archived course keeps its status (contracts/server-actions.md › updateCourse).
 */
export async function updateCourse(adminId: string, courseId: string, fields: CourseFields) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.course.findFirst({
      where: { id: courseId, ownerId: adminId, deletedAt: null },
      select: { status: true, unlockInOrder: true },
    })
    if (!current) fail('course_not_found')

    const status = current.status === 'archived' ? 'archived' : fields.status
    const course = await tx.course.update({
      where: { id: courseId },
      data: { ...courseData(fields), status, updatedAt: new Date() },
      select: { id: true, status: true },
    })

    if (current.unlockInOrder !== fields.unlockInOrder) {
      const rule = JSON.stringify({ type: fields.unlockInOrder ? 'after_previous' : 'none' })
      await tx.$executeRaw`
        update lessons set unlock_rule = ${rule}::jsonb, updated_at = now()
        where course_id = ${courseId}::uuid and unlock_rule ->> 'type' in ('none', 'after_previous')`
    }
    return course
  })
}

const TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  draft: ['active'],
  active: ['draft', 'archived'],
  archived: ['active'],
}

/** draft ↔ active, active → archived, archived → active (data-model.md › Course lifecycle). */
export async function setCourseStatus(adminId: string, courseId: string, status: CourseStatus) {
  const current = await prisma.course.findFirst({
    where: { id: courseId, ownerId: adminId, deletedAt: null },
    select: { status: true },
  })
  if (!current) fail('course_not_found')
  if (current.status === status) return { status }
  if (!TRANSITIONS[current.status].includes(status)) fail('invalid_input')
  await prisma.course.update({
    where: { id: courseId },
    data: { status, updatedAt: new Date() },
  })
  return { status }
}

// ── Delete and restore (US3, research.md R8) ────────────────────────────────────────────────

/** Soft delete; the trimmed confirmation must equal data-model.md Course.title. Lessons are left alone. */
export async function deleteCourse(adminId: string, courseId: string, confirmTitle: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, ownerId: adminId, deletedAt: null },
    select: { title: true },
  })
  if (!course) fail('course_not_found')
  if (confirmTitle.trim() !== course.title.trim()) fail('title_mismatch')
  await prisma.course.update({ where: { id: courseId }, data: { deletedAt: new Date() } })
  return {}
}

/** Clears Course.deletedAt within 30 days; its lessons and students' work come back as they were. */
export async function restoreCourse(adminId: string, courseId: string, now = new Date()) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, ownerId: adminId, deletedAt: { not: null } },
    select: { deletedAt: true },
  })
  if (!course?.deletedAt) fail('course_not_found')
  if (isExpired(course.deletedAt, now)) fail('restore_expired')
  await prisma.course.update({ where: { id: courseId }, data: { deletedAt: null, updatedAt: now } })
  return {}
}

/**
 * Courses deleted in the last 30 days, plus lessons deleted on their own from courses that still
 * exist (lessons of a deleted course come back with it), newest first.
 */
export async function listRecentlyDeleted(
  adminId: string,
  now = new Date(),
): Promise<RecentlyDeleted> {
  const since = new Date(now.getTime() - RESTORE_MS)
  const [courses, lessons] = await Promise.all([
    prisma.course.findMany({
      where: { ownerId: adminId, isPersonal: false, deletedAt: { gte: since } },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        title: true,
        icon: true,
        color: true,
        deletedAt: true,
        _count: { select: { lessons: { where: { deletedAt: null } } } },
      },
    }),
    prisma.lesson.findMany({
      where: { deletedAt: { gte: since }, course: { ownerId: adminId, deletedAt: null } },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        course: { select: { id: true, title: true } },
      },
    }),
  ])
  // The `where` guarantees deletedAt; narrowing keeps the types honest without assertions.
  const dates = (deletedAt: Date | null) =>
    deletedAt
      ? [{ deletedAt: deletedAt.toISOString(), purgeAt: purgeAt(deletedAt).toISOString() }]
      : []
  return {
    courses: courses.flatMap((c) =>
      dates(c.deletedAt).map((d) => ({
        id: c.id,
        title: c.title,
        icon: c.icon,
        color: c.color as CourseColor,
        lessonCount: c._count.lessons,
        ...d,
      })),
    ),
    lessons: lessons.flatMap((l) =>
      dates(l.deletedAt).map((d) => ({ id: l.id, title: l.title, course: l.course, ...d })),
    ),
  }
}
