import 'server-only'
import { flatten, groupCourse } from '@/features/courses/order'
import type { CourseColor } from '@/features/courses/schemas'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import type {
  AdminLessonReview,
  AdminStudentCard,
  AdminStudentDetail,
  CourseProgress,
} from './types'

// What the Admin sees of their linked students' work (spec 004 US1 scenario 4, US2 scenario 3,
// US3 scenario 3; contracts/route-handlers.md › Admin). Callers MUST have run a guard:
// requireRole('admin'), requireAdminOf or requireAdminLessonTarget. Every query is scoped to the
// Admin's own courses and actively linked students.

type Admin = { id: string }

const visibleLesson = { status: 'published' as const, deletedAt: null }

/**
 * course_progress (FR-005) for these students on the Admin's own Active courses, by title. One query
 * for any number of students (no N+1).
 */
async function progressOfStudents(adminId: string, studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, CourseProgress[]>()
  const rows = await prisma.$queryRaw<
    {
      student_id: string
      course_id: string
      title: string
      color: string
      total: number
      done: number
      percent: number | null
    }[]
  >`select cp.student_id, cp.course_id, c.title, c.color, cp.published_lessons::int as total,
           cp.done_lessons::int as done, cp.percent::int as percent
    from course_progress cp
    join courses c on c.id = cp.course_id
    where cp.student_id = any(${studentIds}::uuid[])
      and c.owner_id = ${adminId}::uuid and c.status = 'active' and c.deleted_at is null
    order by c.title`
  const byStudent = new Map<string, CourseProgress[]>()
  for (const r of rows) {
    byStudent.set(r.student_id, [
      ...(byStudent.get(r.student_id) ?? []),
      {
        courseId: r.course_id,
        title: r.title,
        // Course.color is checked by the course form schema (002), as in courses/repo.ts.
        color: r.color as CourseColor,
        percent: r.percent,
        done: r.done,
        total: r.total,
      },
    ])
  }
  return byStudent
}

/** GET /api/admin/students/progress: one card per actively linked student, by name. */
export async function getStudentCards(admin: Admin): Promise<{ students: AdminStudentCard[] }> {
  const links = await prisma.studentLink.findMany({
    where: { adminId: admin.id, status: 'active' },
    select: { student: { select: { id: true, displayName: true, timezone: true } } },
    orderBy: { student: { displayName: 'asc' } },
  })
  const students = links.map((l) => l.student)
  const progress = await progressOfStudents(
    admin.id,
    students.map((s) => s.id),
  )
  return {
    students: students.map((s) => ({ ...s, courses: progress.get(s.id) ?? [] })),
  }
}

/** The Admin's own Active courses assigned to this student, with lessons in course order. */
const assignedCourses = (adminId: string, studentId: string) => ({
  ownerId: adminId,
  status: 'active' as const,
  deletedAt: null,
  assignments: { some: { studentId, status: 'active' } },
})

/** GET /api/admin/students/[studentId]: the student's courses with each lesson's done flag. */
export async function getStudentDetail(
  admin: Admin,
  studentId: string,
): Promise<AdminStudentDetail> {
  const [student, courses, progress] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: studentId },
      select: { id: true, displayName: true, timezone: true },
    }),
    prisma.course.findMany({
      where: assignedCourses(admin.id, studentId),
      orderBy: { title: 'asc' },
      select: {
        id: true,
        sections: { select: { id: true, position: true } },
        lessons: {
          where: visibleLesson,
          select: {
            id: true,
            title: true,
            sectionId: true,
            position: true,
            progress: { where: { studentId, status: 'done' }, select: { lessonId: true } },
          },
        },
      },
    }),
    progressOfStudents(admin.id, [studentId]),
  ])
  const progressOf = new Map((progress.get(studentId) ?? []).map((p) => [p.courseId, p]))
  return {
    student,
    toReview: [],
    courses: courses.flatMap((course) => {
      const summary = progressOf.get(course.id)
      if (!summary) return []
      const ordered = flatten(groupCourse(course.sections, course.lessons))
      return [
        {
          ...summary,
          lessons: ordered.map((l, i) => ({
            id: l.id,
            number: i + 1,
            title: l.title,
            done: l.progress.length > 0,
            submission: null,
          })),
        },
      ]
    }),
  }
}

/** GET /api/admin/students/[studentId]/lessons/[lessonId]: the review screen. */
export async function getAdminLesson(
  admin: Admin,
  studentId: string,
  lessonId: string,
): Promise<AdminLessonReview> {
  const [student, lesson] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: studentId },
      select: { id: true, displayName: true, timezone: true },
    }),
    prisma.lesson.findFirst({
      where: { id: lessonId, ...visibleLesson, course: { ownerId: admin.id } },
      select: {
        id: true,
        title: true,
        assignmentPrompt: true,
        estMinutes: true,
        course: {
          select: {
            id: true,
            title: true,
            status: true,
            sections: { select: { id: true, position: true } },
            lessons: {
              where: visibleLesson,
              select: { id: true, sectionId: true, position: true },
            },
          },
        },
        progress: {
          where: { studentId },
          select: {
            status: true,
            completedAt: true,
            completer: { select: { displayName: true } },
          },
        },
      },
    }),
  ])
  if (!lesson) throw new NotFound('lesson_not_found')
  const ordered = flatten(groupCourse(lesson.course.sections, lesson.course.lessons))
  const progress = lesson.progress[0]
  const done = progress?.status === 'done'
  return {
    student,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      courseId: lesson.course.id,
      courseTitle: lesson.course.title,
      number: ordered.findIndex((l) => l.id === lesson.id) + 1,
      total: ordered.length,
      assignmentPrompt: lesson.assignmentPrompt,
      estMinutes: lesson.estMinutes,
    },
    courseActive: lesson.course.status === 'active',
    progress: {
      done,
      completedAt: done ? (progress.completedAt?.toISOString() ?? null) : null,
      completedByName: done ? (progress.completer?.displayName ?? null) : null,
    },
    submission: null,
    reviewComments: [],
    notesCount: 0,
  }
}
