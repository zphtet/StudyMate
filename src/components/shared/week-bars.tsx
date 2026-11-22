'use client'

import { useFormatter, type DateTimeFormatOptions } from 'next-intl'
import { cn } from '@/lib/utils'
import { useDuration } from './use-duration'

// Seven bars of study time, Monday to Sunday (spec 004 research.md R5): the Progress Week view and
// the Courses tab's "Studied this week" card. Heights are relative to the week's longest day; an
// empty day keeps a 4 px stub; today's label is bold. Each day reads "Monday 16 November, 45 min".

export function WeekBars({
  days,
  today,
  label,
}: {
  /** The 7 local dates of the week, with study seconds. */
  days: { date: string; seconds: number }[]
  /** YYYY-MM-DD in the student's zone. */
  today: string
  /** Names the list for screen readers. */
  label: string
}) {
  const format = useFormatter()
  const duration = useDuration()
  const max = Math.max(...days.map((d) => d.seconds), 0)
  const calendar = (date: string, options: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { ...options, timeZone: 'UTC' })

  return (
    <ol aria-label={label} className="grid grid-cols-7 gap-2">
      {days.map(({ date, seconds }) => {
        const isToday = date === today
        return (
          <li key={date} className="flex flex-col items-center gap-1.5">
            <div className="flex h-24 w-full items-end justify-center">
              <div
                data-testid="week-bar"
                className={cn(
                  'w-full max-w-8 rounded-md',
                  isToday ? 'bg-primary' : 'bg-primary/45',
                  seconds === 0 && 'bg-muted',
                )}
                style={{ height: seconds > 0 && max > 0 ? `${(seconds / max) * 100}%` : '4px' }}
              />
            </div>
            <span
              aria-hidden
              className={cn(
                'text-xs text-muted-foreground',
                isToday && 'font-bold text-foreground',
              )}
            >
              {calendar(date, { weekday: 'narrow' })}
            </span>
            <span className="sr-only">
              {calendar(date, { weekday: 'long', day: 'numeric', month: 'long' })},{' '}
              {duration(seconds)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
