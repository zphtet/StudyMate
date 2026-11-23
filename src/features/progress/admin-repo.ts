import 'server-only'
import { countOverdue } from '@/features/assignments/student-repo'
import { flatten, groupCourse } from '@/features/courses/order'
import type { AvailabilityStatus, ShiftType } from '@/features/shifts/types'
import type { CourseColor } from '@/features/courses/schemas'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { todayIn } from '@/lib/time'
import { dailyActivityForStudents, weekFacts } from '@/server/activity'
import { countNotes, getReviewComments, submissionSelect, toSubmissionView } from './repo'
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

/**
 * Submitted answers waiting for this Admin, oldest first: on Published, non-deleted lessons of their
 * own courses that the student is still actively assigned, so each one opens on the review screen
 * (requireAdminLessonTarget). One query for any number of students.
 */
async function submissionsToReview(adminId: string, studentIds: string[]) {
  if (studentIds.length === 0) return []
  return prisma.$queryRaw<
    {
      submission_id: string
      student_id: string
      lesson_id: string
      lesson_title: string
      course_title: string
      submitted_at: Date
    }[]
  >`select s.id as submission_id, s.student_id, s.lesson_id, l.title as lesson_title,
           c.title as course_title, s.submitted_at
    from submissions s
    join lessons l on l.id = s.lesson_id
    join courses c on c.id = l.course_id
    join course_assignments ca
      on ca.course_id = c.id and ca.student_id = s.student_id and ca.status = 'active'
    where s.student_id = any(${studentIds}::uuid[]) and s.status = 'submitted'
      and c.owner_id = ${adminId}::uuid and c.deleted_at is null
      and l.status = 'published' and l.deleted_at is null
    order by s.submitted_at, s.id`
}

/**
 * GET /api/admin/students/progress: one card per actively linked student, by name, from a fixed
 * number of queries for all students (research.md R2, R12). Weeks are each student's local Mon–Sun.
 */
export async function getStudentCards(
  admin: Admin,
  now = new Date(),
): Promise<{ students: AdminStudentCard[] }> {
  const links = await prisma.studentLink.findMany({
    where: { adminId: admin.id, status: 'active' },
    select: { student: { select: { id: true, displayName: true, timezone: true } } },
    orderBy: { student: { displayName: 'asc' } },
  })
  const students = links.map((l) => l.student)
  const ids = students.map((s) => s.id)
  const [progress, toReview, activity, overdue, statuses] = await Promise.all([
    progressOfStudents(admin.id, ids),
    submissionsToReview(admin.id, ids),
    dailyActivityForStudents(ids),
    countOverdue(ids, now),
    statusOfStudents(ids, now),
  ])
  const waiting = (studentId: string) => toReview.filter((r) => r.student_id === studentId).length
  return {
    students: students.map((s) => {
      const week = weekFacts(activity.get(s.id) ?? [], todayIn(s.timezone, now))
      return {
        ...s,
        overdueCount: overdue.get(s.id) ?? 0,
        toReview: waiting(s.id),
        streak: week.streak,
        weekSeconds: week.weekSeconds,
        weekLessonsDone: week.weekLessonsDone,
        courses: progress.get(s.id) ?? [],
        status: statuses.get(s.id) ?? UNKNOWN,
      }
    }),
  }
}

const UNKNOWN: AvailabilityStatus = { state: 'unknown', until: null, shiftType: null }

/**
 * Spec 005 US4 (research R8): each student's live status at `now` from SQL status_at() (FR-006, the
 * one rule) and the type of the working shift running then, in one statement for all students.
 * status_at runs as the server connection; the caller's links scope is the access rule.
 */
async function statusOfStudents(ids: string[], now: Date) {
  if (ids.length === 0) return new Map<string, AvailabilityStatus>()
  const rows = await prisma.$queryRaw<
    {
      student_id: string
      state: AvailabilityStatus['state']
      until: Date | null
      shift_type: ShiftType | null
    }[]
  >`
    select p.id as student_id, s.state, s.until,
           (select sh.type::text from shifts sh
             where sh.student_id = p.id and sh.type <> 'off'
               and sh.start_at <= ${now} and sh.end_at > ${now}
             limit 1) as shift_type
      from unnest(${ids}::uuid[]) as p(id)
      cross join lateral status_at(p.id, ${now}) s`
  return new Map(
    rows.map((r) => [
      r.student_id,
      {
        state: r.state,
        until: r.until?.toISOString() ?? null,
        shiftType: r.state === 'on_shift' ? r.shift_type : null,
      },
    ]),
  )
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
  const [student, courses, progress, toReview] = await Promise.all([
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
            // The Admin never sees a Draft (spec Role access).
            submissions: {
              where: { studentId, status: { not: 'draft' } },
              select: { status: true },
            },
          },
        },
      },
    }),
    progressOfStudents(admin.id, [studentId]),
    submissionsToReview(admin.id, [studentId]),
  ])
  const progressOf = new Map((progress.get(studentId) ?? []).map((p) => [p.courseId, p]))
  return {
    student,
    toReview: toReview.map((r) => ({
      submissionId: r.submission_id,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title,
      courseTitle: r.course_title,
      submittedAt: r.submitted_at.toISOString(),
    })),
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
            submission: l.submissions[0]?.status ?? null,
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
  const [student, lesson, reviewComments, notesCount] = await Promise.all([
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
        // The Admin never sees a Draft (spec Role access): it shows as "not submitted yet".
        submissions: { where: { studentId, status: { not: 'draft' } }, select: submissionSelect },
      },
    }),
    getReviewComments(admin, studentId, lessonId),
    countNotes(studentId, lessonId),
  ])
  if (!lesson) throw new NotFound('lesson_not_found')
  const submission = lesson.submissions[0]
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
    submission: submission ? reviewView(submission) : null,
    // Review comments only exist on a sent answer; a Draft shows none.
    reviewComments: submission ? reviewComments : [],
    notesCount,
  }
}

/** A non-Draft submission as the Admin sees it; submitted_at is set on every submit. */
function reviewView(
  row: Parameters<typeof toSubmissionView>[0],
): NonNullable<AdminLessonReview['submission']> {
  const view = toSubmissionView(row)
  if (view.status === 'draft' || !view.submittedAt) throw new NotFound('submission_not_found')
  return { ...view, status: view.status, submittedAt: view.submittedAt }
}
