'use client'

import { useFormatter, useNow } from 'next-intl'

/** "Fri, 20 Nov" in the viewer's language and time zone (constitution IV). */
export function TodayLabel() {
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  return <>{format.dateTime(now, { weekday: 'short', day: 'numeric', month: 'short' })}</>
}
