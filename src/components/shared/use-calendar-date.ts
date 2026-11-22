'use client'

import { useFormatter } from 'next-intl'

/** Formats a calendar date (`YYYY-MM-DD`) as written, e.g. "31 Dec 2026", in the viewer's language.
 *  Calendar dates have no time zone: they are read and shown in UTC so the day never shifts. */
export function useCalendarDate() {
  const format = useFormatter()
  return (date: string, withYear = true) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), {
      day: 'numeric',
      month: 'short',
      ...(withYear && { year: 'numeric' }),
      timeZone: 'UTC',
    })
}
