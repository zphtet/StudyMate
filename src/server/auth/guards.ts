import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { createServerClient } from '@/lib/supabase/server'

// Prisma bypasses Row-Level Security, so these guards ARE the access rules for server code.
// They mirror the SQL helpers in prisma/migrations/0_init (is_admin_of, can_read_course, ...).
// Every Route Handler and Server Action calls one of them before touching data.

export class AuthError extends Error {
  constructor(
    public status: 401 | 403 | 404,
    message: string,
  ) {
    super(message)
  }
}

/** Signed-in user + profile, verified with Supabase Auth (cached per request). */
export const requireUser = cache(async () => {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AuthError(401, 'Not signed in')
  if (!user.email_confirmed_at) throw new AuthError(403, 'Email not confirmed')
  const profile = await prisma.profile.findUnique({ where: { id: user.id } })
  if (!profile) throw new AuthError(403, 'No profile')
  return profile
})

export async function requireRole(role: 'student' | 'admin') {
  const me = await requireUser()
  if (me.role !== role) throw new AuthError(403, `Only ${role}s can do this`)
  return me
}

/** Admin acting on a student: the student must be actively linked to this admin. */
export async function requireAdminOf(studentId: string) {
  const me = await requireRole('admin')
  const link = await prisma.studentLink.findFirst({
    where: { adminId: me.id, studentId, status: 'active' },
    select: { id: true },
  })
  if (!link) throw new AuthError(403, 'Not your student')
  return me
}

/** The student themself or their linked admin (shifts, progress, availability...). */
export async function requireSelfOrAdminOf(studentId: string) {
  const me = await requireUser()
  if (me.id === studentId) return me
  return requireAdminOf(studentId)
}

/** Owner of a course (admin courses, or a student's personal course). */
export async function requireCourseOwner(courseId: string) {
  const me = await requireUser()
  const course = await prisma.course.findFirst({
    where: { id: courseId, ownerId: me.id },
    select: { id: true },
  })
  if (!course) throw new AuthError(404, 'Course not found')
  return me
}

/** Read access: owner, linked admin of a personal course, or an assigned student (active/archived only). */
export async function requireCourseReader(courseId: string) {
  const me = await requireUser()
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      deletedAt: null,
      OR: [
        { ownerId: me.id },
        {
          isPersonal: true,
          owner: { linksAsStudent: { some: { adminId: me.id, status: 'active' } } },
        },
        {
          status: { in: ['active', 'archived'] },
          assignments: { some: { studentId: me.id, status: 'active' } },
        },
      ],
    },
    select: { id: true, ownerId: true },
  })
  if (!course) throw new AuthError(404, 'Course not found')
  return { me, isOwner: course.ownerId === me.id }
}
