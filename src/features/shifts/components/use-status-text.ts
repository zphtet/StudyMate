'use client'

import { useTranslations } from 'next-intl'
import { useTimeBoth } from '@/components/shared/time-both'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { statusLine } from '../status-text'
import type { AvailabilityStatus } from '../types'

/**
 * "On night shift until 07:00 · 04:30 yours": the student's time first, the viewer's beside it when
 * the clocks differ (constitution IV; useTimeBoth), with the weekday for a change over a day away.
 */
export function useStatusText() {
  const t = useTranslations('availabilityStatus')
  const timeBoth = useTimeBoth()
  const { weekday } = useInstantFormat()
  return (status: AvailabilityStatus, timeZone: string, now = new Date()) => {
    const line = statusLine(status, now)
    if (line.kind === 'free') return t('free')
    if (line.kind === 'unknown') return t('unknown')
    const time =
      line.until &&
      `${line.showWeekday ? `${weekday(line.until, timeZone)} ` : ''}${timeBoth(line.until, timeZone, { compact: true })}`
    if (line.kind === 'sleeping') return time ? t('sleepingUntil', { time }) : t('sleeping')
    const type = t(`types.${line.shiftType ?? 'custom'}`)
    return time ? t('onShiftUntil', { type, time }) : t('onShift', { type })
  }
}
