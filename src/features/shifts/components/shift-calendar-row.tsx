'use client'

import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SettingsRow } from '@/components/shared/settings'
import { shiftsTodayQuery } from '../queries'

// The Me screen's "Shift calendar" row (screen 11-Profile; spec 005 research R10): links to Shifts,
// with "{n} shifts this week" or "No shifts this week" (working shifts, this local Monday to Sunday).
export function ShiftCalendarRow() {
  const t = useTranslations('shifts')
  const { data } = useQuery(shiftsTodayQuery)
  return (
    <SettingsRow
      href="/s/shifts"
      icon={<CalendarDays className="size-5 text-muted-foreground" aria-hidden />}
      label={t('calendarRow')}
      value={data && t('weekShifts', { count: data.weekShifts })}
    />
  )
}
