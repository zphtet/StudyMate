'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { CalendarMonth } from '@/components/shared/calendar-month'
import { useDuration } from '@/components/shared/use-duration'
import { cn } from '@/lib/utils'
import type { ProgressDay } from '../types'

// The Month view's calendar (screen 06-Progress; research.md R5): each past day shaded by study time
// (--heat-1..4), today outlined, future days dashed. Each day's name ends ", 45 min studied".

const SHADE = {
  0: 'bg-muted text-foreground',
  1: 'bg-heat-1 text-foreground',
  2: 'bg-heat-2 text-foreground',
  3: 'bg-heat-3 text-foreground',
  4: 'bg-heat-4 text-primary-foreground',
} as const

export function HeatCalendar({
  today,
  days,
  goal,
}: {
  today: string
  days: ProgressDay[]
  goal: { days: number; activeThisWeek: number }
}) {
  const t = useTranslations('progress')
  const format = useFormatter()
  const duration = useDuration()
  const byDate = new Map(days.map((d) => [d.date, d]))
  const month = today.slice(0, 7)

  return (
    <section aria-labelledby="progress-month" className="rounded-3xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="progress-month" className="text-lg font-semibold">
          {format.dateTime(new Date(`${month}-01T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('weeklyGoal', { count: goal.activeThisWeek, goal: goal.days })}
        </p>
      </div>
      <CalendarMonth
        month={month}
        today={today}
        dayClassName={(date) =>
          cn(
            // 06-Progress: rounded squares with the number centred; still 44 px tall (constitution V).
            'min-h-11 justify-center rounded-lg py-0',
            date > today
              ? 'border border-dashed bg-transparent font-normal text-muted-foreground'
              : cn(
                  SHADE[byDate.get(date)?.level ?? 0],
                  date === today && 'ring-2 ring-foreground ring-inset',
                ),
          )
        }
        badge={(date) => {
          if (date > today) return null
          const seconds = byDate.get(date)?.seconds ?? 0
          return (
            <span className="sr-only">
              , {seconds > 0 ? t('dayStudied', { duration: duration(seconds) }) : t('dayNone')}
            </span>
          )
        }}
      />
      <div className="mt-3 flex items-center justify-end gap-1.5 text-sm text-muted-foreground">
        <span>{t('less')}</span>
        <span role="img" aria-label={t('legend')} className="flex gap-1">
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span key={level} className={cn('size-3.5 rounded-sm', SHADE[level])} />
          ))}
        </span>
        <span>{t('more')}</span>
      </div>
    </section>
  )
}
