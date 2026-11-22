// @vitest-environment node
// Spec 001 FR-009 / SC-002: the guards are the access rules for Prisma (which bypasses RLS).
// Runs against the dev database (DIRECT_URL / DATABASE_URL): fixtures are created through auth.users
// (trigger handle_new_user makes profiles and invites) and deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  AuthError,
  requireAdminLessonTarget,
  requireAdminOf,
  requireAdminOfAll,
  requireAssignmentOwner,
  requireCourseOwner,
  requireCourseReader,
  requireLessonOwner,
  requireLessonReader,
  requireRole,
  requireSelfOrAdminOf,
  requireSubmissionReviewer,
  requireUser,
} from './guards'

type FakeUser = { id: string; email_confirmed_at: string | null } | null
let currentUser: FakeUser = null

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}))

const id = {
  student: randomUUID(),
  otherStudent: randomUUID(),
  admin: randomUUID(),
  otherAdmin: randomUUID(),
  // Spec 003: linked but unassigned, pending link, and assigned to the admin's course but not linked.
  secondStudent: randomUUID(),
  pendingStudent: randomUUID(),
  unlinkedStudent: randomUUID(),
}
const course = {
  admin: randomUUID(),
  adminDraft: randomUUID(),
  personal: randomUUID(),
  archived: randomUUID(),
  deleted: randomUUID(),
  removed: randomUUID(), // spec 003: active course, the student's assignment is `removed`
  otherAdmins: randomUUID(),
}
// Spec 002: same cases as supabase/tests/002_course_policies.test.sql (can_read_lesson).
const lesson = {
  published: randomUUID(),
  draft: randomUUID(),
  deleted: randomUUID(),
  inDraftCourse: randomUUID(),
  archivedDone: randomUUID(),
  archivedOpen: randomUUID(),
  inDeletedCourse: randomUUID(),
  inRemoved: randomUUID(), // spec 003
  otherAdmins: randomUUID(), // spec 003
}
// Spec 004: same cases as supabase/tests/004_progress_policies.test.sql (subs_admin_review).
const submission = {
  submitted: randomUUID(),
  draft: randomUUID(),
  otherAdminsCourse: randomUUID(),
  unlinked: randomUUID(),
}
const run = Date.now()

const signInAs = (userId: string, confirmed = true) => {
  currentUser = { id: userId, email_confirmed_at: confirmed ? new Date().toISOString() : null }
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toBeInstanceOf(AuthError)
  await expect(promise).rejects.toMatchObject({ status })
}

beforeAll(async () => {
  const users = [
    [id.student, 'student', 'Guard Student'],
    [id.otherStudent, 'student', 'Guard Other Student'],
    [id.admin, 'admin', 'Guard Admin'],
    [id.otherAdmin, 'admin', 'Guard Other Admin'],
    [id.secondStudent, 'student', 'Guard Second Student'],
    [id.pendingStudent, 'student', 'Guard Pending Student'],
    [id.unlinkedStudent, 'student', 'Guard Unlinked Student'],
  ] as const
  for (const [userId, role, name] of users) {
    const meta = JSON.stringify({ role, display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${userId}::uuid, ${`guard-${run}-${userId}@example.test`}, ${meta}::jsonb)`
  }
  await prisma.studentLink.createMany({
    data: [
      { studentId: id.student, adminId: id.admin, status: 'active' },
      { studentId: id.secondStudent, adminId: id.admin, status: 'active' },
      { studentId: id.pendingStudent, adminId: id.admin, status: 'pending' },
    ],
  })
  await prisma.course.createMany({
    data: [
      { id: course.admin, ownerId: id.admin, title: 'Admin course', status: 'active' },
      { id: course.adminDraft, ownerId: id.admin, title: 'Draft course', status: 'draft' },
      { id: course.personal, ownerId: id.student, title: 'My notes', isPersonal: true },
      { id: course.archived, ownerId: id.admin, title: 'Archived course', status: 'archived' },
      {
        id: course.deleted,
        ownerId: id.admin,
        title: 'Deleted course',
        status: 'active',
        deletedAt: new Date(),
      },
      { id: course.removed, ownerId: id.admin, title: 'Removed course', status: 'active' },
      { id: course.otherAdmins, ownerId: id.otherAdmin, title: 'Other course', status: 'active' },
    ],
  })
  await prisma.courseAssignment.createMany({
    data: [
      ...[course.admin, course.adminDraft, course.archived, course.deleted].map((courseId) => ({
        courseId,
        studentId: id.student,
        assignedBy: id.admin,
      })),
      { courseId: course.removed, studentId: id.student, assignedBy: id.admin, status: 'removed' },
      { courseId: course.otherAdmins, studentId: id.student, assignedBy: id.otherAdmin },
      { courseId: course.admin, studentId: id.unlinkedStudent, assignedBy: id.admin },
    ],
  })
  const now = new Date()
  await prisma.lesson.createMany({
    data: [
      {
        id: lesson.published,
        courseId: course.admin,
        title: 'Published',
        status: 'published',
        position: 0,
      },
      { id: lesson.draft, courseId: course.admin, title: 'Draft', status: 'draft', position: 1 },
      {
        id: lesson.deleted,
        courseId: course.admin,
        title: 'Deleted',
        status: 'published',
        position: 2,
        deletedAt: now,
      },
      {
        id: lesson.inDraftCourse,
        courseId: course.adminDraft,
        title: 'In draft course',
        status: 'published',
        position: 0,
      },
      {
        id: lesson.archivedDone,
        courseId: course.archived,
        title: 'Done',
        status: 'published',
        position: 0,
      },
      {
        id: lesson.archivedOpen,
        courseId: course.archived,
        title: 'Open',
        status: 'published',
        position: 1,
      },
      {
        id: lesson.inDeletedCourse,
        courseId: course.deleted,
        title: 'In deleted course',
        status: 'published',
        position: 0,
      },
      {
        id: lesson.inRemoved,
        courseId: course.removed,
        title: 'In removed course',
        status: 'published',
        position: 0,
      },
      {
        id: lesson.otherAdmins,
        courseId: course.otherAdmins,
        title: 'Other admin lesson',
        status: 'published',
        position: 0,
      },
    ],
  })
  await prisma.lessonProgress.create({
    data: {
      studentId: id.student,
      lessonId: lesson.archivedDone,
      status: 'done',
      completedAt: now,
    },
  })
  await prisma.submission.createMany({
    data: [
      {
        id: submission.submitted,
        studentId: id.student,
        lessonId: lesson.published,
        status: 'submitted',
        submittedAt: now,
      },
      {
        id: submission.draft,
        studentId: id.student,
        lessonId: lesson.archivedOpen,
        status: 'draft',
      },
      {
        id: submission.otherAdminsCourse,
        studentId: id.student,
        lessonId: lesson.otherAdmins,
        status: 'submitted',
        submittedAt: now,
      },
      {
        id: submission.unlinked,
        studentId: id.unlinkedStudent,
        lessonId: lesson.published,
        status: 'submitted',
        submittedAt: now,
      },
    ],
  })
})

afterAll(async () => {
  const ids = Object.values(id)
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${ids}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${ids}::uuid[])`
  await prisma.$disconnect()
})

beforeEach(() => {
  currentUser = null
})

describe('requireUser', () => {
  test('signed out → 401', async () => {
    await expectStatus(requireUser(), 401)
  })
  test('email not confirmed → 403', async () => {
    signInAs(id.student, false)
    await expectStatus(requireUser(), 403)
  })
  test('no profile → 403', async () => {
    signInAs(randomUUID())
    await expectStatus(requireUser(), 403)
  })
  test('confirmed user with a profile → the profile', async () => {
    signInAs(id.student)
    await expect(requireUser()).resolves.toMatchObject({ id: id.student, role: 'student' })
  })
})

describe('requireRole', () => {
  test('matching role → allowed', async () => {
    signInAs(id.admin)
    await expect(requireRole('admin')).resolves.toMatchObject({ id: id.admin })
  })
  test('other role → 403', async () => {
    signInAs(id.student)
    await expectStatus(requireRole('admin'), 403)
  })
})

describe('requireAdminOf', () => {
  test('the actively linked admin → allowed', async () => {
    signInAs(id.admin)
    await expect(requireAdminOf(id.student)).resolves.toMatchObject({ id: id.admin })
  })
  test('an admin not linked to the student → 403', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireAdminOf(id.student), 403)
  })
  test('a student → 403', async () => {
    signInAs(id.otherStudent)
    await expectStatus(requireAdminOf(id.student), 403)
  })
})

describe('requireSelfOrAdminOf', () => {
  test('the student themself → allowed', async () => {
    signInAs(id.student)
    await expect(requireSelfOrAdminOf(id.student)).resolves.toMatchObject({ id: id.student })
  })
  test('their linked admin → allowed', async () => {
    signInAs(id.admin)
    await expect(requireSelfOrAdminOf(id.student)).resolves.toMatchObject({ id: id.admin })
  })
  test('another student → 403', async () => {
    signInAs(id.otherStudent)
    await expectStatus(requireSelfOrAdminOf(id.student), 403)
  })
})

describe('requireCourseOwner', () => {
  test('the owner → allowed', async () => {
    signInAs(id.admin)
    await expect(requireCourseOwner(course.admin)).resolves.toMatchObject({ id: id.admin })
  })
  test('another admin → 404 (never reveals the course exists)', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireCourseOwner(course.admin), 404)
  })
  test('an assigned student is not an owner → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireCourseOwner(course.admin), 404)
  })
})

describe('requireCourseReader', () => {
  test('owner → allowed as owner', async () => {
    signInAs(id.admin)
    await expect(requireCourseReader(course.admin)).resolves.toMatchObject({ isOwner: true })
  })
  test('assigned student, active course → allowed, not owner', async () => {
    signInAs(id.student)
    await expect(requireCourseReader(course.admin)).resolves.toMatchObject({ isOwner: false })
  })
  test('assigned student, draft course → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireCourseReader(course.adminDraft), 404)
  })
  test('linked admin reads the student’s personal course', async () => {
    signInAs(id.admin)
    await expect(requireCourseReader(course.personal)).resolves.toMatchObject({ isOwner: false })
  })
  test('unlinked admin → 404', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireCourseReader(course.personal), 404)
  })
  test('another student → 404', async () => {
    signInAs(id.otherStudent)
    await expectStatus(requireCourseReader(course.admin), 404)
  })
})

// Spec 002 (data-model.md › Guards): mirrors can_read_lesson / owns_course.
describe('requireLessonOwner', () => {
  test('the owner → allowed, with the course id', async () => {
    signInAs(id.admin)
    await expect(requireLessonOwner(lesson.published)).resolves.toMatchObject({
      me: { id: id.admin },
      courseId: course.admin,
    })
  })
  test('the owner of a deleted lesson → allowed (restore needs it)', async () => {
    signInAs(id.admin)
    await expect(requireLessonOwner(lesson.deleted)).resolves.toMatchObject({
      courseId: course.admin,
    })
  })
  test('another admin → 404', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireLessonOwner(lesson.published), 404)
  })
  test('an assigned student → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireLessonOwner(lesson.published), 404)
  })
})

describe('requireLessonReader', () => {
  test('owner reads a draft lesson as owner', async () => {
    signInAs(id.admin)
    await expect(requireLessonReader(lesson.draft)).resolves.toMatchObject({ isOwner: true })
  })
  test('assigned student reads a published lesson of an active course', async () => {
    signInAs(id.student)
    await expect(requireLessonReader(lesson.published)).resolves.toMatchObject({
      isOwner: false,
      courseId: course.admin,
    })
  })
  test('assigned student, draft lesson → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireLessonReader(lesson.draft), 404)
  })
  test('assigned student, deleted lesson → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireLessonReader(lesson.deleted), 404)
  })
  test('assigned student, lesson of a draft course → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireLessonReader(lesson.inDraftCourse), 404)
  })
  test('assigned student, completed lesson of an archived course → allowed', async () => {
    signInAs(id.student)
    await expect(requireLessonReader(lesson.archivedDone)).resolves.toMatchObject({
      isOwner: false,
    })
  })
  test('assigned student, uncompleted lesson of an archived course → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireLessonReader(lesson.archivedOpen), 404)
  })
  test('assigned student, lesson of a deleted course → 404', async () => {
    signInAs(id.student)
    await expectStatus(requireLessonReader(lesson.inDeletedCourse), 404)
  })
  test('unassigned student → 404', async () => {
    signInAs(id.otherStudent)
    await expectStatus(requireLessonReader(lesson.published), 404)
  })
  test('another admin → 404', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireLessonReader(lesson.published), 404)
  })
})

// Spec 003 (data-model.md › Guards): same allowed and denied cases as
// supabase/tests/003_assign_policies.test.sql (assign_write, the tightened deadlines_write).
async function expectCode(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AuthError)
  await expect(promise).rejects.toMatchObject({ status, code })
}

describe('requireAdminOfAll', () => {
  test('every student actively linked → allowed', async () => {
    signInAs(id.admin)
    await expect(requireAdminOfAll([id.student, id.secondStudent])).resolves.toMatchObject({
      id: id.admin,
    })
  })
  test('the same student twice still counts once', async () => {
    signInAs(id.admin)
    await expect(requireAdminOfAll([id.student, id.student])).resolves.toMatchObject({
      id: id.admin,
    })
  })
  test('one student not linked → 403', async () => {
    signInAs(id.admin)
    await expectStatus(requireAdminOfAll([id.student, id.otherStudent]), 403)
  })
  test('one link still pending → 403', async () => {
    signInAs(id.admin)
    await expectStatus(requireAdminOfAll([id.student, id.pendingStudent]), 403)
  })
  test('another admin → 403', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireAdminOfAll([id.student]), 403)
  })
  test('a student → 403', async () => {
    signInAs(id.student)
    await expectStatus(requireAdminOfAll([id.student]), 403)
  })
})

describe('requireAssignmentOwner', () => {
  test('owner, linked student, active assignment → the assignment', async () => {
    signInAs(id.admin)
    await expect(requireAssignmentOwner(course.admin, id.student)).resolves.toMatchObject({
      me: { id: id.admin },
      assignment: { courseId: course.admin, studentId: id.student, dueAt: null },
    })
  })
  test('a removed assignment → 404 assignment_not_found', async () => {
    signInAs(id.admin)
    await expectCode(
      requireAssignmentOwner(course.removed, id.student),
      404,
      'assignment_not_found',
    )
  })
  test('a linked student without an assignment → 404 assignment_not_found', async () => {
    signInAs(id.admin)
    await expectCode(
      requireAssignmentOwner(course.admin, id.secondStudent),
      404,
      'assignment_not_found',
    )
  })
  test('another admin’s course → 404', async () => {
    signInAs(id.admin)
    await expectStatus(requireAssignmentOwner(course.otherAdmins, id.student), 404)
  })
  test('the owner, but the student is not linked to them → 403', async () => {
    signInAs(id.admin)
    await expectStatus(requireAssignmentOwner(course.admin, id.unlinkedStudent), 403)
  })
  test('a student → 403', async () => {
    signInAs(id.student)
    await expectStatus(requireAssignmentOwner(course.admin, id.student), 403)
  })
})

describe('requireAdminLessonTarget', () => {
  test('owner’s Published lesson, linked student with an active assignment → allowed', async () => {
    signInAs(id.admin)
    await expect(requireAdminLessonTarget(lesson.published, id.student)).resolves.toMatchObject({
      me: { id: id.admin },
      courseId: course.admin,
    })
  })
  test.each([
    ['a Draft lesson', () => lesson.draft],
    ['a deleted lesson', () => lesson.deleted],
    ['another admin’s lesson', () => lesson.otherAdmins],
  ])('%s → 404 lesson_not_found', async (_, lessonId) => {
    signInAs(id.admin)
    await expectCode(requireAdminLessonTarget(lessonId(), id.student), 404, 'lesson_not_found')
  })
  test('no active assignment (removed) → 404 assignment_not_found', async () => {
    signInAs(id.admin)
    await expectCode(
      requireAdminLessonTarget(lesson.inRemoved, id.student),
      404,
      'assignment_not_found',
    )
  })
  test('a linked student who is not assigned → 404 assignment_not_found', async () => {
    signInAs(id.admin)
    await expectCode(
      requireAdminLessonTarget(lesson.published, id.secondStudent),
      404,
      'assignment_not_found',
    )
  })
  test('an assigned student who is not linked to the admin → 403', async () => {
    signInAs(id.admin)
    await expectStatus(requireAdminLessonTarget(lesson.published, id.unlinkedStudent), 403)
  })
  test('another admin → 404', async () => {
    signInAs(id.otherAdmin)
    await expectStatus(requireAdminLessonTarget(lesson.published, id.student), 404)
  })
  test('a student → 403', async () => {
    signInAs(id.student)
    await expectStatus(requireAdminLessonTarget(lesson.published, id.student), 403)
  })
})

// Spec 004 data-model.md › Guards: mirrors subs_admin_review. Anything the Admin may not review is
// 404 submission_not_found, so a guess at another student's submission id learns nothing.
describe('requireSubmissionReviewer', () => {
  test('linked Admin, Submitted, lesson in their course → returns the submission', async () => {
    signInAs(id.admin)
    await expect(requireSubmissionReviewer(submission.submitted)).resolves.toMatchObject({
      me: { id: id.admin },
      submission: { id: submission.submitted, studentId: id.student, lessonId: lesson.published },
    })
  })
  test.each([
    ['a Draft', () => submission.draft],
    ['a lesson in another admin’s course', () => submission.otherAdminsCourse],
    ['a student who is not linked to the admin', () => submission.unlinked],
    ['an unknown id', () => randomUUID()],
  ])('%s → 404 submission_not_found', async (_, submissionId) => {
    signInAs(id.admin)
    await expectCode(requireSubmissionReviewer(submissionId()), 404, 'submission_not_found')
  })
  test('another admin → 404 submission_not_found', async () => {
    signInAs(id.otherAdmin)
    await expectCode(requireSubmissionReviewer(submission.submitted), 404, 'submission_not_found')
  })
  test('a student → 403', async () => {
    signInAs(id.student)
    await expectStatus(requireSubmissionReviewer(submission.submitted), 403)
  })
})
