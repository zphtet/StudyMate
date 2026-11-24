'use client'

import { useNow } from 'next-intl'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { utcToZoned } from '@/lib/time'

export type DayPeriod = 'morning' | 'afternoon' | 'evening'

/**
 * morning < 12:00 ≤ afternoon < 18:00 ≤ evening, on the viewer's clock. Today's greeting and
 * Appearance's preview card (spec 007 FR-011) both use it.
 */
export function useDayPeriod(): DayPeriod {
  const f = useInstantFormat()
  const now = useNow({ updateInterval: 60_000 })
  const hour = Number(utcToZoned(now, f.viewerZone).time.slice(0, 2))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}
