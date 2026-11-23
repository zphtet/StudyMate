'use client'

import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SettingsRow } from '@/components/shared/settings'
import { myRemindersQuery } from '../queries'

// "My reminders · 3 on" on a student's Me (spec 006 US5 scenario 2; 11-Profile.png): the student's
// own reminders that are on, plus the Admin's rules that reach them (those are always on: a student
// can't mute them, FR-016).
export function MyRemindersRow() {
  const t = useTranslations('myReminders')
  const { data } = useQuery(myRemindersQuery)
  const count = data
    ? data.personal.filter((rule) => rule.enabled).length + data.fromAdmin.length
    : null

  return (
    <SettingsRow
      href="/s/me/reminders"
      icon={<Bell className="size-5 text-primary" aria-hidden />}
      label={t('row')}
      value={count === null ? '' : t('on', { count })}
    />
  )
}
