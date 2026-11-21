'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { CalendarMonth } from '@/components/shared/calendar-month'
import { addMonths, todayIn } from '@/lib/time'
import { cn } from '@/lib/utils'
import { planMonthQuery } from '../queries'
import { NavButton } from './nav-button'

// The Plan month (spec 003 US4 scenario 3, FR-010): "‹ November 2026 ›" and a calendar with the
// number of deadlines per day, red when any of them is late. Tapping a day opens its week.

export function PlanMonth({
  studentId,
  month,
  onMonthChange,
  onSelectDay,
}: {
  studentId: string
  /** YYYY-MM, or null for this month in the student's zone. */
  month: string | null
  onMonthChange: (month: string) => void
  onSelectDay: (date: string) => void
}) {
  const t = useTranslations('plan')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const { data } = useQuery({
    ...planMonthQuery(studentId, month),
    placeholderData: (previous) => (previous?.student.id === studentId ? previous : undefined),
  })
  if (!data) return null

  const counts = new Map(data.days.map((day) => [day.date, day]))
  return (
    <div className="flex flex-col gap-3">
      <div className="-ml-3 flex items-center">
        <NavButton
          label={t('previousMonth')}
          onClick={() => onMonthChange(addMonths(data.month, -1))}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </NavButton>
        <h2 className="text-lg font-semibold" aria-live="polite">
          {format.dateTime(new Date(`${data.month}-01T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </h2>
        <NavButton label={t('nextMonth')} onClick={() => onMonthChange(addMonths(data.month, 1))}>
          <ChevronRight className="size-5" aria-hidden />
        </NavButton>
      </div>
      <div className="rounded-3xl border bg-card p-2">
        <CalendarMonth
          month={data.month}
          today={todayIn(data.student.timezone, now)}
          onSelectDay={onSelectDay}
          badge={(date) => {
            const day = counts.get(date)
            if (!day) return null
            return (
              <span
                data-testid="month-count"
                className={cn(
                  'min-w-6 rounded-full px-1.5 text-xs leading-5 font-semibold',
                  day.late > 0
                    ? 'bg-destructive-soft text-destructive'
                    : 'bg-accent text-accent-foreground',
                )}
              >
                <span aria-hidden>{day.count}</span>
                <span className="sr-only">
                  , {t('monthCount', { count: day.count, late: day.late })}
                </span>
              </span>
            )
          }}
        />
      </div>
      <p className="px-2 text-center text-sm text-muted-foreground">{t('monthHint')}</p>
    </div>
  )
}
