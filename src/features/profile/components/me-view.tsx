'use client'

import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { LanguageButtons } from '@/components/shared/language-buttons'
import { SettingsGroup, SettingsRow, SettingsSection } from '@/components/shared/settings'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/auth/actions'
import { unsubscribeThisDevice } from '@/lib/push-device'
import { unwrap } from '@/lib/result'
import { meQuery } from '../queries'
import { EditProfileSheet } from './edit-profile-sheet'
import { WeeklyGoalSheet } from './weekly-goal-sheet'

// Me (screen 11-Profile). Students set their weekly goal here (spec 004 FR-008); the page puts
// 005's Shift calendar row above it and 006's reminder rows below (`studyRows`). The Admin's page
// passes 006's rows as `reminderRows`. Colour themes, fonts and text size arrive with 007.
export function MeView({
  studyRows,
  reminderRows,
}: {
  studyRows?: ReactNode
  /** Admin only: there is no Study section (spec 006 contracts/ui-routes.md › Me). */
  reminderRows?: ReactNode
}) {
  const t = useTranslations()
  const { data: me } = useSuspenseQuery(meQuery)
  const base = me.role === 'admin' ? '/a/me' : '/s/me'

  const out = useMutation({
    // Spec 006 FR-014: this device stops getting the user's notifications.
    mutationFn: async () => {
      const endpoint = await unsubscribeThisDevice().catch(() => null)
      return unwrap(await signOut({ endpoint: endpoint ?? undefined }))
    },
    // Full reload: drops every cached query at once, so nothing refetches as a signed-out user.
    onSettled: () => window.location.replace('/sign-in'),
  })

  const subtitle =
    me.role === 'admin'
      ? t('me.admin')
      : me.link?.status === 'active'
        ? t('me.studentOf', { admin: me.link.admin.displayName })
        : t('me.studentAlone')

  return (
    <div className="flex flex-col gap-7">
      <section className="flex items-center gap-4">
        <InitialAvatar name={me.displayName} seed={me.id} size="lg" className="size-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold">{me.displayName}</p>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <EditProfileSheet me={me} />
      </section>

      {me.role === 'student' && (
        <SettingsSection title={t('me.study')}>
          <SettingsGroup>
            {studyRows}
            <WeeklyGoalSheet days={me.weeklyGoalDays} />
          </SettingsGroup>
        </SettingsSection>
      )}

      {reminderRows && (
        <SettingsSection title={t('me.reminders')}>
          <SettingsGroup>{reminderRows}</SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title={t('me.language')}>
        <LanguageButtons label={t('me.language')} />
      </SettingsSection>

      <SettingsSection title={t('me.app')}>
        <SettingsGroup>
          <SettingsRow
            href={`${base}/appearance`}
            icon={<span className="size-6 rounded-full bg-primary" aria-hidden />}
            label={t('me.appearance')}
            value={t('me.appearanceValue', { mode: me.colorMode })}
          />
          <SettingsRow href={`${base}/account`} label={t('me.account')} />
          <SettingsRow href="/api/me/export" download label={t('me.export')} />
        </SettingsGroup>
      </SettingsSection>

      <Button
        variant="outline"
        size="xl"
        onClick={() => out.mutate()}
        disabled={out.isPending}
        className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
      >
        {t('common.signOut')}
      </Button>
    </div>
  )
}
