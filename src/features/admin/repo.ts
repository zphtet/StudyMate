import 'server-only'
import { inviteUrl } from '@/features/profile/repo'
import { prisma } from '@/lib/prisma'
import type { AdminOverview } from './types'

// Callers MUST have run requireRole('admin'); every query is scoped to that admin's id.

export async function getOverview(adminId: string): Promise<AdminOverview> {
  const [invite, courseCreated, studentInvited, courseAssigned, remindersOn] = await Promise.all([
    prisma.adminInvite.findFirst({ where: { adminId, active: true }, select: { code: true } }),
    prisma.course.count({ where: { ownerId: adminId, isPersonal: false, deletedAt: null } }),
    prisma.studentLink.count({ where: { adminId, status: { in: ['pending', 'active'] } } }),
    prisma.courseAssignment.count({ where: { assignedBy: adminId, status: 'active' } }),
    prisma.pushSubscription.count({ where: { userId: adminId } }),
  ])
  if (!invite) throw new Error('Admin has no active invite code')
  const checklist = {
    courseCreated: courseCreated > 0,
    studentInvited: studentInvited > 0,
    courseAssigned: courseAssigned > 0,
    remindersOn: remindersOn > 0,
  }
  return {
    invite: { code: invite.code, url: inviteUrl(invite.code) },
    checklist,
    done: Object.values(checklist).filter(Boolean).length,
  }
}
