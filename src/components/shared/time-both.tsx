'use client'

import { useTranslations } from 'next-intl'
import { cityOf, utcToZoned } from '@/lib/time'
import { useInstantFormat } from './use-instant-format'

// A student's time with the viewer's beside it (constitution IV; spec 003 FR-008, research R4):
//   default  "Tue 1 Dec, 23:59 (Tokyo) · 22:29 (Yangon)"
//   compact  "21:00 · 19:30 yours" (Plan cards and "Move to …", where the day is already shown)
// The second part only appears when the two clocks differ, with the weekday when its date differs.

/** The text of `TimeBoth`, for labels that embed it ("Move to Sat 18:00 · 16:30 yours"). */
export function useTimeBoth() {
  const t = useTranslations('deadlines')
  const f = useInstantFormat()
  return (at: Date | string, timeZone: string, { compact = false } = {}) => {
    const theirs = utcToZoned(at, timeZone)
    const mine = utcToZoned(at, f.viewerZone)
    const primary = compact ? f.time(at, timeZone) : f.dayTime(at, timeZone)
    if (theirs.date === mine.date && theirs.time === mine.time) {
      return compact ? primary : t('timeOne', { primary, primaryCity: cityOf(timeZone) })
    }
    const secondary = theirs.date === mine.date ? f.time(at) : f.weekdayTime(at)
    return compact
      ? t('timeCompact', { primary, secondary })
      : t('timeBoth', {
          primary,
          primaryCity: cityOf(timeZone),
          secondary,
          secondaryCity: cityOf(f.viewerZone),
        })
  }
}

export function TimeBoth({
  at,
  timeZone,
  compact = false,
}: {
  at: Date | string
  /** The student's zone: shown first. */
  timeZone: string
  compact?: boolean
}) {
  const timeBoth = useTimeBoth()
  return <>{timeBoth(at, timeZone, { compact })}</>
}
