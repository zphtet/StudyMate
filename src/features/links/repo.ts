import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { fail } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import type { InvitePreview, JoinRequest } from './types'

// Link rules live here (research R2; data-model.md StudentLink lifecycle). They mirror request_join
// and respond_join in 0_init. Callers MUST have run a guard; ids come from the guard, and every
// write has the caller's id in its `where`.

/** FR-004: a student sees app content only with an active link. */
export async function hasActiveLink(studentId: string) {
  const link = await prisma.studentLink.findFirst({
    where: { studentId, status: 'active' },
    select: { id: true },
  })
  return link !== null
}

/**
 * The admin behind an active code: name and Active course count, nothing else (FR-005). A replaced
 * code finds nothing (data-model.md AdminInvite.active; US2 scenario 4).
 */
export async function getInvitePreview(code: string): Promise<InvitePreview | null> {
  const invite = await prisma.adminInvite.findFirst({
    where: { code, active: true },
    select: {
      admin: {
        select: {
          displayName: true,
          _count: {
            select: {
              courses: { where: { status: 'active', deletedAt: null, isPersonal: false } },
            },
          },
        },
      },
    },
  })
  if (!invite) return null
  return {
    admin: { displayName: invite.admin.displayName },
    activeCourses: invite.admin._count.courses,
  }
}

/** SQLSTATE 23505: student_links_one_active refused a second active link (a race with the check). */
function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * The student asks to join the admin behind `code` (US2 scenario 1). Not while linked (FR-006,
 * already_linked); an older pending request is withdrawn (FR-006). Errors: code_not_found,
 * already_linked.
 */
export async function requestJoin(studentId: string, code: string) {
  return prisma.$transaction(async (tx) => {
    const linked = await tx.studentLink.findFirst({
      where: { studentId, status: 'active' },
      select: { id: true },
    })
    if (linked) fail('already_linked')
    const invite = await tx.adminInvite.findFirst({
      where: { code, active: true },
      select: { adminId: true, admin: { select: { displayName: true } } },
    })
    if (!invite) fail('code_not_found')
    const now = new Date()
    await tx.studentLink.updateMany({
      where: { studentId, status: 'pending' },
      data: { status: 'removed', respondedAt: now },
    })
    const link = await tx.studentLink.create({
      data: { studentId, adminId: invite.adminId },
      select: { id: true },
    })
    return { linkId: link.id, admin: { displayName: invite.admin.displayName } }
  })
}

/**
 * The admin approves or declines a pending request (US2 scenarios 2–3). Errors: request_not_found
 * (not theirs, or no longer pending), already_linked (the student joined someone else first).
 */
export async function respondToRequest(adminId: string, linkId: string, approve: boolean) {
  try {
    return await prisma.$transaction(async (tx) => {
      const link = await tx.studentLink.findFirst({
        where: { id: linkId, adminId, status: 'pending' },
        select: { studentId: true },
      })
      if (!link) fail('request_not_found')
      if (approve) {
        const elsewhere = await tx.studentLink.findFirst({
          where: { studentId: link.studentId, status: 'active' },
          select: { id: true },
        })
        if (elsewhere) fail('already_linked')
      }
      const status = approve ? ('active' as const) : ('declined' as const)
      await tx.studentLink.update({
        where: { id: linkId, adminId, status: 'pending' },
        data: { status, respondedAt: new Date() },
      })
      return { status }
    })
  } catch (error) {
    if (isUniqueViolation(error)) fail('already_linked')
    throw error
  }
}

/** The student leaves their admin (Edge Cases: keeps their own history). Error: not_linked. */
export async function leaveAdmin(studentId: string) {
  const { count } = await prisma.studentLink.updateMany({
    where: { studentId, status: 'active' },
    data: { status: 'removed', respondedAt: new Date() },
  })
  if (count === 0) fail('not_linked')
}

/**
 * The admin removes one of their students (Edge Cases: the student keeps their own history and loses
 * the admin's courses). Error: student_not_found (not linked to this admin).
 */
export async function removeStudent(adminId: string, studentId: string) {
  const { count } = await prisma.studentLink.updateMany({
    where: { adminId, studentId, status: 'active' },
    data: { status: 'removed', respondedAt: new Date() },
  })
  if (count === 0) fail('student_not_found')
}

/** Pending requests to this admin, newest first (screen 16-AdminStudents). */
export async function listJoinRequests(adminId: string): Promise<JoinRequest[]> {
  const links = await prisma.studentLink.findMany({
    where: { adminId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      student: { select: { id: true, displayName: true } },
    },
  })
  return links.map((link) => ({
    linkId: link.id,
    student: link.student,
    requestedAt: link.createdAt.toISOString(),
  }))
}

/**
 * Marks a `system` notice read (data-model.md Notification: "Your admin closed their account" on
 * the join screen). Error: notice_not_found.
 */
export async function dismissNotice(userId: string, id: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId, sourceType: 'system', readAt: null },
    data: { readAt: new Date() },
  })
  if (count === 0) fail('notice_not_found')
}
