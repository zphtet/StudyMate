'use client'

import { useNow, useTranslations } from 'next-intl'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { addCalendarDays, todayIn } from '@/lib/time'

// "Today", "Tomorrow" or "Wed 4 Mar" for a moment on a given clock, and its time: the composer's
// summary and the Scheduled messages cards (25-AdminMessage.png, 24-AdminNotify.png).

export function useWhenLabel() {
  const t = useTranslations('composer')
  const { day, time, viewerZone } = useInstantFormat()
  const now = useNow({ updateInterval: 60_000 })
  const dayWord = (at: Date | string, zone: string) => {
    const date = todayIn(zone, new Date(at))
    const today = todayIn(zone, now)
    if (date === today) return t('dayToday')
    if (date === addCalendarDays(today, 1)) return t('dayTomorrow')
    return day(at, zone)
  }
  return { now, dayWord, time, viewerZone }
}
