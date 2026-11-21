'use client'

import { useFormatter, useTimeZone, type DateTimeFormatOptions } from 'next-intl'

// Formats instants in the viewer's language, in a given zone (default: the viewer's own; constitution
// IV). Times are 24-hour everywhere, as in the screenshots ("21:00").

const TIME = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
const DAY = { weekday: 'short', day: 'numeric', month: 'short' } as const

export function useInstantFormat() {
  const format = useFormatter()
  const viewerZone = useTimeZone() ?? 'UTC'
  const formatWith = (options: DateTimeFormatOptions) => (at: Date | string, timeZone?: string) =>
    format.dateTime(new Date(at), { ...options, timeZone: timeZone ?? viewerZone })
  return {
    viewerZone,
    /** "21:00" */
    time: formatWith(TIME),
    /** "Wed" ("Move to Wed 18:00": the suggestion is within a week) */
    weekday: formatWith({ weekday: 'short' }),
    /** "Wed 18 Nov" */
    day: formatWith(DAY),
    /** "24 Nov" */
    date: formatWith({ day: 'numeric', month: 'short' }),
    /** "31 Dec 2026" */
    fullDate: formatWith({ day: 'numeric', month: 'short', year: 'numeric' }),
    /** "Wed 18 Nov, 21:00" */
    dayTime: formatWith({ ...DAY, ...TIME }),
    /** "Wed 21:00" */
    weekdayTime: formatWith({ weekday: 'short', ...TIME }),
  }
}
