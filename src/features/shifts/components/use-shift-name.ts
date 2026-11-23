'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { utcToZoned } from '@/lib/time'
import type { ShiftView } from '../types'

/**
 * A shift in words for screen readers and links: "Night shift 22:00 to Saturday 07:00", "Day shift
 * 09:00 to 18:00", "Day off" (contracts/ui-routes.md: each calendar day's name ends with its shifts).
 */
export function useShiftName(timeZone: string) {
  const t = useTranslations('shifts')
  const format = useFormatter()
  const { time } = useInstantFormat()
  return (shift: ShiftView) => {
    const type = t(`named.${shift.type}`)
    if (shift.type === 'off') return type
    const start = time(shift.startAt, timeZone)
    const end = time(shift.endAt, timeZone)
    const lastMinute = new Date(new Date(shift.endAt).getTime() - 1)
    const isSameDay =
      utcToZoned(shift.startAt, timeZone).date === utcToZoned(lastMinute, timeZone).date
    return isSameDay
      ? t('shiftSameDay', { type, start, end })
      : t('shiftOvernight', {
          type,
          start,
          end,
          weekday: format.dateTime(new Date(shift.endAt), { weekday: 'long', timeZone }),
        })
  }
}
