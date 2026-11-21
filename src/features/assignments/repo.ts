import 'server-only'
import { flatten, groupCourse } from '@/features/courses/order'
import { applyUnlockInOrder } from '@/features/courses/repo'
import { fail } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { assignedNotice, deadlineNotice, defaultReminderMessages } from './notices'
import type {
  SaveAssignmentsInput,
  SetCourseDeadlineInput,
  SetLessonDeadlineInput,
} from './schemas'
import { effectiveDue } from './status'
import type { AdminStudentCourse, AssignSheet, StudentRef } from './types'

// Assignments (spec 003 US1; research.md R5, R8, R9). Callers MUST have run the guards
// (requireCourseOwner, requireAdminOfAll); every course `where` still has `ownerId: admin`.

type Admin = { id: string; displayName: string }

const sameInstant = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null)

/** The 006 FR-008 default set (data-model.md › Default reminder set). */
const DEFAULT_RULES = [
  { trigger: 'daily', config: { preset: 'default', time: '20:00', days: [1, 2, 3, 4, 5, 6, 7] } },
  { trigger: 'due_soon', config: { preset: 'default', offsets_h: [24, 2] } },
  { trigger: 'overdue', config: { preset: 'default', time: '19:00', max: 3 } },
  { trigger: 'streak_risk', config: { preset: 'default', time: '21:30' } },
] as const

export async function getAssignSheet(adminId: string, courseId: string): Promise<AssignSheet> {
  const [course, links] = await Promise.all([
    prisma.course.findFirst({
      where: { id: courseId, ownerId: adminId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        targetDate: true,
        unlockInOrder: true,
        assignments: { where: { status: 'active' }, select: { studentId: true, dueAt: true } },
      },
    }),
    prisma.studentLink.findMany({
      where: { adminId, status: 'active' },
      orderBy: { student: { displayName: 'asc' } },
      select: { student: { select: { id: true, displayName: true, timezone: true } } },
    }),
  ])
  if (!course) throw new NotFound('course_not_found')
  const active = new Map(course.assignments.map((a) => [a.studentId, a.dueAt]))
  return {
    course: {
      id: course.id,
      title: course.title,
      status: course.status,
      targetDate: course.targetDate?.toISOString().slice(0, 10) ?? null,
      unlockInOrder: course.unlockInOrder,
    },
    students: links.map(({ student }) => ({
      ...student,
      assigned: active.has(student.id),
      dueAt: active.get(student.id)?.toISOString() ?? null,
    })),
  }
}

/**
 * The whole Assign sheet in one transaction: upsert ticked rows (active, assigned_by = admin),
 * set previously active, now unticked rows to `removed` (progress, submissions and lesson deadlines
 * stay; FR-007), apply "Unlock lessons in order", insert default reminders at most once. Notices
 * are recorded after the commit: `assigned` for new or reassigned students when `notifyNow`, and
 * `deadline` for already assigned students whose course deadline changed.
 */
export async function saveAssignments(admin: Admin, input: SaveAssignmentsInput) {
  const ticked = input.rows.filter((r) => r.assigned)
  const students = await prisma.profile.findMany({
    where: { id: { in: ticked.map((r) => r.studentId) } },
    select: { id: true, locale: true, timezone: true },
  })

  const outcome = await prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: input.courseId, ownerId: admin.id },
      select: { id: true, title: true, status: true, deletedAt: true, unlockInOrder: true },
    })
    if (!course || course.deletedAt || course.status !== 'active') fail('course_not_active')

    const existing = await tx.courseAssignment.findMany({
      where: { courseId: course.id, studentId: { in: input.rows.map((r) => r.studentId) } },
      select: { studentId: true, status: true, dueAt: true },
    })
    const before = new Map(existing.map((a) => [a.studentId, a]))
    const newlyAssigned: { studentId: string; dueAt: Date | null }[] = []
    const changed: { studentId: string; dueAt: Date | null }[] = []

    for (const row of ticked) {
      const dueAt = row.dueAt ? new Date(row.dueAt) : null
      const previous = before.get(row.studentId)
      await tx.courseAssignment.upsert({
        where: { courseId_studentId: { courseId: course.id, studentId: row.studentId } },
        create: { courseId: course.id, studentId: row.studentId, assignedBy: admin.id, dueAt },
        update: { status: 'active', assignedBy: admin.id, dueAt },
      })
      if (previous?.status !== 'active') newlyAssigned.push({ studentId: row.studentId, dueAt })
      else if (!sameInstant(previous.dueAt, dueAt))
        changed.push({ studentId: row.studentId, dueAt })
    }

    const toRemove = input.rows
      .filter((r) => !r.assigned && before.get(r.studentId)?.status === 'active')
      .map((r) => r.studentId)
    if (toRemove.length > 0) {
      await tx.courseAssignment.updateMany({
        where: { courseId: course.id, studentId: { in: toRemove } },
        data: { status: 'removed' },
      })
    }

    if (course.unlockInOrder !== input.unlockInOrder) {
      await tx.course.update({
        where: { id: course.id },
        data: { unlockInOrder: input.unlockInOrder, updatedAt: new Date() },
      })
      await applyUnlockInOrder(tx, course.id, input.unlockInOrder)
    }

    if (input.addDefaultReminders && students.length > 0) {
      const data = await Promise.all(
        students.map(async (student) => {
          const messages = await defaultReminderMessages(student)
          return DEFAULT_RULES.map((rule) => ({
            adminId: admin.id,
            studentId: student.id,
            trigger: rule.trigger,
            config: rule.config,
            message: messages[rule.trigger],
          }))
        }),
      )
      // ON CONFLICT DO NOTHING on notification_rules_default_once: at most once (FR-013).
      await tx.notificationRule.createMany({ data: data.flat(), skipDuplicates: true })
    }

    return { course, newlyAssigned, changed, unassigned: toRemove.length }
  })

  const studentById = new Map(students.map((s) => [s.id, s]))
  // The guard checked every row's link, so each ticked student has a profile.
  const studentOf = (id: string) => studentById.get(id) ?? fail('student_not_found')
  const { course } = outcome
  await Promise.all([
    ...(input.notifyNow ? outcome.newlyAssigned : []).map(({ studentId, dueAt }) =>
      assignedNotice({ student: studentOf(studentId), admin, course, dueAt }),
    ),
    ...outcome.changed.map(({ studentId, dueAt }) =>
      deadlineNotice({
        student: studentOf(studentId),
        admin,
        item: { kind: 'course', id: course.id, title: course.title },
        dueAt,
      }),
    ),
  ])
  return {
    assigned: outcome.newlyAssigned.length,
    unassigned: outcome.unassigned,
    updated: outcome.changed.length,
  }
}

const noticeStudent = (studentId: string) =>
  prisma.profile.findUniqueOrThrow({
    where: { id: studentId },
    select: { id: true, locale: true, timezone: true },
  })

const isEditable = (course: { status: string; deletedAt: Date | null }) =>
  course.status === 'active' && !course.deletedAt

/**
 * One student's course deadline (spec 003 US2; research R6). Guard: requireAssignmentOwner. Records a
 * `deadline` notice when the value changed (FR-012).
 */
export async function setCourseDeadline(admin: Admin, input: SetCourseDeadlineInput) {
  const assignment = await prisma.courseAssignment.findFirst({
    where: {
      courseId: input.courseId,
      studentId: input.studentId,
      status: 'active',
      course: { ownerId: admin.id },
    },
    select: {
      id: true,
      dueAt: true,
      course: { select: { title: true, status: true, deletedAt: true } },
    },
  })
  if (!assignment) fail('assignment_not_found')
  if (!isEditable(assignment.course)) fail('course_not_active')
  const dueAt = input.dueAt ? new Date(input.dueAt) : null
  await prisma.courseAssignment.update({ where: { id: assignment.id }, data: { dueAt } })
  if (!sameInstant(assignment.dueAt, dueAt)) {
    await deadlineNotice({
      student: await noticeStudent(input.studentId),
      admin,
      item: { kind: 'course', id: input.courseId, title: assignment.course.title },
      dueAt,
    })
  }
  return { dueAt: dueAt?.toISOString() ?? null }
}

/**
 * One student's own deadline for a Published lesson; null removes it and the lesson falls back to
 * the course deadline (FR-003, FR-004). Guard: requireLessonDeadlineTarget. Records a `deadline`
 * notice when the EFFECTIVE deadline changed.
 */
export async function setLessonDeadline(admin: Admin, input: SetLessonDeadlineInput) {
  const { lessonId, studentId } = input
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, status: 'published', deletedAt: null, course: { ownerId: admin.id } },
    select: {
      title: true,
      course: {
        select: {
          status: true,
          deletedAt: true,
          assignments: { where: { studentId, status: 'active' }, select: { dueAt: true } },
        },
      },
      deadlines: { where: { studentId }, select: { dueAt: true } },
    },
  })
  if (!lesson) fail('lesson_not_found')
  const [assignment] = lesson.course.assignments
  if (!assignment) fail('assignment_not_found')
  if (!isEditable(lesson.course)) fail('course_not_active')

  const dueAt = input.dueAt ? new Date(input.dueAt) : null
  if (dueAt) {
    await prisma.lessonDeadline.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      create: { lessonId, studentId, dueAt, setBy: admin.id },
      update: { dueAt, setBy: admin.id },
    })
  } else {
    await prisma.lessonDeadline.deleteMany({ where: { lessonId, studentId } })
  }

  const before = effectiveDue(lesson.deadlines[0]?.dueAt, assignment.dueAt)
  const after = effectiveDue(dueAt, assignment.dueAt)
  if (!sameInstant(before, after)) {
    await deadlineNotice({
      student: await noticeStudent(studentId),
      admin,
      item: { kind: 'lesson', id: lessonId, title: lesson.title },
      dueAt: after,
    })
  }
  return { dueAt: dueAt?.toISOString() ?? null, effectiveDueAt: after?.toISOString() ?? null }
}

/** The caller's actively linked students by name (Plan chips). */
export async function listLinkedStudents(adminId: string): Promise<StudentRef[]> {
  const links = await prisma.studentLink.findMany({
    where: { adminId, status: 'active' },
    orderBy: { student: { displayName: 'asc' } },
    select: { student: { select: { id: true, displayName: true, timezone: true } } },
  })
  return links.map((l) => l.student)
}

/** The caller's Active courses assigned to the student, with Published lessons in course order. */
export async function listStudentCoursesForAdmin(
  adminId: string,
  studentId: string,
): Promise<AdminStudentCourse[]> {
  const courses = await prisma.course.findMany({
    where: {
      ownerId: adminId,
      status: 'active',
      deletedAt: null,
      assignments: { some: { studentId, status: 'active' } },
    },
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      assignments: { where: { studentId, status: 'active' }, select: { dueAt: true } },
      sections: { select: { id: true, position: true } },
      lessons: {
        where: { status: 'published', deletedAt: null },
        select: {
          id: true,
          title: true,
          estMinutes: true,
          sectionId: true,
          position: true,
          deadlines: { where: { studentId }, select: { dueAt: true } },
        },
      },
    },
  })
  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    dueAt: course.assignments[0]?.dueAt?.toISOString() ?? null,
    lessons: flatten(groupCourse(course.sections, course.lessons)).map((lesson, i) => ({
      id: lesson.id,
      number: i + 1,
      title: lesson.title,
      estMinutes: lesson.estMinutes,
      dueAt: lesson.deadlines[0]?.dueAt.toISOString() ?? null,
    })),
  }))
}
