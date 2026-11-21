'use client'

import { useFormatter, type DateTimeFormatOptions } from 'next-intl'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { addCalendarDays, datesOfMonth, mondayOf } from '@/lib/time'
import { cn } from '@/lib/utils'

// A month of calendar dates, weeks starting Monday (spec 003 Plan month; 004 and 005 reuse it).
// Each day is a button with a badge slot. One day is in the tab order; the arrow keys move by day
// and by week inside the month, Home / End to the start and end of the week.

const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

export function CalendarMonth({
  month,
  today,
  badge,
  onSelectDay,
}: {
  /** YYYY-MM */
  month: string
  /** YYYY-MM-DD in the zone the calendar belongs to. */
  today: string
  /** Content under the day number (visible or screen-reader text). */
  badge?: (date: string) => ReactNode
  onSelectDay: (date: string) => void
}) {
  const format = useFormatter()
  const dates = datesOfMonth(month)
  const [focused, setFocused] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const active =
    focused && dates.includes(focused) ? focused : dates.includes(today) ? today : dates[0]

  const calendar = (date: string, options: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { ...options, timeZone: 'UTC' })
  const firstMonday = mondayOf(dates[0])
  const weekdays = Array.from({ length: 7 }, (_, i) => addCalendarDays(firstMonday, i))
  const cells = [...Array<null>(weekdays.indexOf(dates[0])).fill(null), ...dates]
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => cells[w * 7 + d] ?? null),
  )

  const focusDay = (date: string) => {
    setFocused(date)
    buttons.current.get(date)?.focus()
  }
  const onKeyDown = (event: KeyboardEvent, date: string) => {
    const position = cells.indexOf(date) % 7 // 0 = Monday
    const step =
      KEY_STEP[event.key] ??
      (event.key === 'Home' ? -position : event.key === 'End' ? 6 - position : undefined)
    if (step === undefined) return
    event.preventDefault()
    const next = addCalendarDays(date, step)
    if (dates.includes(next)) focusDay(next)
  }

  return (
    <table className="w-full table-fixed border-separate border-spacing-x-0.5 border-spacing-y-1">
      <thead>
        <tr>
          {weekdays.map((date) => (
            <th
              key={date}
              scope="col"
              abbr={calendar(date, { weekday: 'long' })}
              className="pb-1 text-xs font-medium text-muted-foreground"
            >
              {calendar(date, { weekday: 'narrow' })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.find(Boolean) ?? ''}>
            {week.map((date, i) =>
              date ? (
                <td key={date} className="p-0">
                  <button
                    ref={(node) => {
                      if (node) buttons.current.set(date, node)
                      else buttons.current.delete(date)
                    }}
                    type="button"
                    data-date={date}
                    tabIndex={date === active ? 0 : -1}
                    aria-current={date === today ? 'date' : undefined}
                    onClick={() => onSelectDay(date)}
                    onFocus={() => setFocused(date)}
                    onKeyDown={(event) => onKeyDown(event, date)}
                    className={cn(
                      'flex min-h-14 w-full flex-col items-center justify-start gap-1 rounded-xl py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                      date === today && 'bg-accent font-semibold text-primary',
                    )}
                  >
                    <span className="text-sm tabular-nums">
                      {calendar(date, { day: 'numeric' })}
                    </span>
                    <span className="sr-only">
                      , {calendar(date, { weekday: 'long', month: 'long' })}
                    </span>
                    {badge?.(date)}
                  </button>
                </td>
              ) : (
                <td key={`blank-${i}`} />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
