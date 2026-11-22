import 'server-only'
import { hasLocale } from '@/i18n/locales'
import { prisma } from '@/lib/prisma'
import type { MeResponse } from './types'

// Read side for the signed-in user. Callers MUST have run requireUser(); every query is scoped to
// that user's id.

export const inviteUrl = (code: string) =>
  `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/join/${code}`

type Me = {
  id: string
  email: string
  role: 'student' | 'admin'
  displayName: string
  timezone: string
  locale: string
  colorMode: string
  weeklyGoalDays: number
}

export async function getMe(me: Me): Promise<MeResponse> {
  const [link, notices, invite] = await Promise.all([
    me.role === 'student'
      ? prisma.studentLink.findFirst({
          // data-model.md › StudentLink.status: only pending/active links are current.
          where: { studentId: me.id, status: { in: ['pending', 'active'] } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            createdAt: true,
            admin: { select: { id: true, displayName: true } },
          },
        })
      : null,
    prisma.notification.findMany({
      // data-model.md › Notification.sourceType = system: the "admin closed their account" notice.
      where: { userId: me.id, sourceType: 'system', readAt: null },
      orderBy: { sentAt: 'desc' },
      select: { id: true, occurrenceKey: true, sentAt: true },
    }),
    me.role === 'admin'
      ? prisma.adminInvite.findFirst({
          // data-model.md › AdminInvite.active: exactly one active code per admin.
          where: { adminId: me.id, active: true },
          select: { code: true },
        })
      : null,
  ])

  return {
    id: me.id,
    email: me.email,
    role: me.role,
    displayName: me.displayName,
    timezone: me.timezone,
    locale: hasLocale(me.locale) ? me.locale : 'en',
    colorMode: me.colorMode === 'light' || me.colorMode === 'dark' ? me.colorMode : 'system',
    weeklyGoalDays: me.weeklyGoalDays,
    link:
      link && (link.status === 'pending' || link.status === 'active')
        ? {
            id: link.id,
            status: link.status,
            admin: link.admin,
            requestedAt: link.createdAt.toISOString(),
          }
        : null,
    notices: notices
      .filter((n) => n.occurrenceKey.startsWith('admin-deleted:'))
      .map((n) => ({ id: n.id, key: 'admin_deleted' as const, sentAt: n.sentAt.toISOString() })),
    invite: invite ? { code: invite.code, url: inviteUrl(invite.code) } : null,
  }
}

/** GET /api/me/export (contracts/route-handlers.md › Export): the caller's own data as JSON. */
export async function getExport(me: Me & { createdAt: Date }) {
  const [links, invites] = await Promise.all([
    prisma.studentLink.findMany({
      where: me.role === 'admin' ? { adminId: me.id } : { studentId: me.id },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        createdAt: true,
        respondedAt: true,
        admin: { select: { displayName: true } },
        student: { select: { displayName: true } },
      },
    }),
    me.role === 'admin'
      ? prisma.adminInvite.findMany({
          where: { adminId: me.id },
          orderBy: { createdAt: 'asc' },
          select: { code: true, active: true, createdAt: true },
        })
      : [],
  ])
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      displayName: me.displayName,
      email: me.email,
      role: me.role,
      timezone: me.timezone,
      locale: me.locale,
      createdAt: me.createdAt.toISOString(),
    },
    links: links.map((l) => ({
      otherPerson: me.role === 'admin' ? l.student.displayName : l.admin.displayName,
      role: me.role === 'admin' ? ('student' as const) : ('admin' as const),
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      respondedAt: l.respondedAt?.toISOString() ?? null,
    })),
    invites: invites.map((i) => ({
      code: i.code,
      active: i.active,
      createdAt: i.createdAt.toISOString(),
    })),
  }
}
