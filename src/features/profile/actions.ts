'use server'

import { setPreferenceCookies } from '@/features/auth/preferences'
import { action } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import { createServerClient } from '@/lib/supabase/server'
import { requireRole, requireUser } from '@/server/auth/guards'
import { deleteAuthUser } from '@/server/supabase-admin'
import { saveAppearance as saveAppearanceRow } from './repo'
import {
  deleteAccountSchema,
  saveAppearanceSchema,
  updateProfileSchema,
  weeklyGoalSchema,
} from './schemas'

// Profile actions (contracts/server-actions.md). Each starts with a guard; writes touch only the
// caller's own profile.

export const updateProfile = action(updateProfileSchema, async (input) => {
  const me = await requireUser()
  const profile = await prisma.profile.update({
    where: { id: me.id },
    data: input,
    select: { displayName: true, timezone: true, locale: true },
  })
  await setPreferenceCookies(profile)
  return profile
})

/**
 * Spec 007 contracts/server-actions.md › saveAppearance: mode, theme, font or text size, saved to
 * the account so other devices follow, and to this device's `appearance` cookie (research R9).
 */
export const saveAppearance = action(saveAppearanceSchema, async (input) => {
  const me = await requireUser()
  const appearance = await saveAppearanceRow(me.id, input)
  await setPreferenceCookies({ appearance })
  return appearance
})

/** Spec 004 FR-008: the student's weekly goal ("{n} of {goal}" on Today and Progress). */
export const setWeeklyGoal = action(weeklyGoalSchema, async ({ days }) => {
  const me = await requireRole('student')
  await prisma.profile.update({ where: { id: me.id }, data: { weeklyGoalDays: days } })
  return { days }
})

/**
 * Delete account (research R6): admins first leave a notice for each linked student (FR-015),
 * then the auth user is deleted through the admin API, which cascades to every row of theirs.
 */
export const deleteAccount = action(deleteAccountSchema, async () => {
  const me = await requireUser()

  if (me.role === 'admin') {
    const links = await prisma.studentLink.findMany({
      where: { adminId: me.id, status: { in: ['pending', 'active'] } },
      select: { studentId: true },
    })
    if (links.length > 0) {
      // data-model.md › Notification: sourceType system, occurrenceKey admin-deleted:<admin id>.
      await prisma.notification.createMany({
        data: links.map(({ studentId }) => ({
          userId: studentId,
          sourceType: 'system',
          occurrenceKey: `admin-deleted:${me.id}`,
          title: 'Your admin closed their account',
          body: `${me.displayName} closed their StudyMate account. Join another admin with their code.`,
          url: '/join',
        })),
        skipDuplicates: true,
      })
    }
  }

  await deleteAuthUser(me.id)
  const supabase = await createServerClient()
  await supabase.auth.signOut().catch(() => null)
  return {}
})
