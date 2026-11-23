'use client'

import { useFormatter } from 'next-intl'

/** A calendar date with its weekday, "Fri, Nov 20", in the viewer's language (UTC: dates have no zone). */
export function useDayLabel() {
  const format = useFormatter()
  return (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
}
