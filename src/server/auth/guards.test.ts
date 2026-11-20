// @vitest-environment node
// Spec 001 FR-009 / SC-002: the guards are the access rules for Prisma (which bypasses RLS).
// Runs against the dev database (DIRECT_URL / DATABASE_URL): fixtures are created through auth.users
// (trigger handle_new_user makes profiles and invites) and deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  AuthError,
  requireAdminOf,
  requireCourseOwner,
  requireCourseReader,
  requireRole,
  requireSelfOrAdminOf,
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
}
const course = { admin: randomUUID(), adminDraft: randomUUID(), personal: randomUUID() }
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
  ] as const
  for (const [userId, role, name] of users) {
    const meta = JSON.stringify({ role, display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${userId}::uuid, ${`guard-${run}-${userId}@example.test`}, ${meta}::jsonb)`
  }
  await prisma.studentLink.create({
    data: { studentId: id.student, adminId: id.admin, status: 'active' },
  })
  await prisma.course.createMany({
    data: [
      { id: course.admin, ownerId: id.admin, title: 'Admin course', status: 'active' },
      { id: course.adminDraft, ownerId: id.admin, title: 'Draft course', status: 'draft' },
      { id: course.personal, ownerId: id.student, title: 'My notes', isPersonal: true },
    ],
  })
  await prisma.courseAssignment.createMany({
    data: [
      { courseId: course.admin, studentId: id.student, assignedBy: id.admin },
      { courseId: course.adminDraft, studentId: id.student, assignedBy: id.admin },
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
