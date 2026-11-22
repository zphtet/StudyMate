'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useDuration } from '@/components/shared/use-duration'
import { addMonths } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { ProgressResponse, ProgressView } from '../types'

// The three cards at the top of Progress (screen 06-Progress; contracts/ui-routes.md › Progress):
// day streak with the best run, time studied with active days, and lessons done against the previous
// month or week.

export function StatCards({ data, view }: { data: ProgressResponse; view: ProgressView }) {
  const t = useTranslations('progress')
  const format = useFormatter()
  const duration = useDuration()
  const { count, previous } = data.lessonsDone
  const change = count - previous
  const month = format.dateTime(new Date(`${addMonths(data.today.slice(0, 7), -1)}-01T00:00:00Z`), {
    month: 'short',
    timeZone: 'UTC',
  })
  const comparison =
    change > 0
      ? t(view === 'month' ? 'monthMore' : 'weekMore', { count: change, month })
      : change < 0
        ? t(view === 'month' ? 'monthLess' : 'weekLess', { count: -change, month })
        : t(view === 'month' ? 'monthSame' : 'weekSame', { month })

  return (
    <div className="grid grid-cols-3 gap-2.5">
      <Stat
        value={data.streak.current}
        valueClassName="text-course-rust"
        label={t('streak')}
        detail={t('best', { count: data.streak.best })}
      />
      <Stat
        value={duration(data.studied.seconds)}
        label={t('studied')}
        detail={t('studyDays', { count: data.studied.activeDays })}
      />
      <Stat
        value={count}
        label={t('lessonsDone')}
        detail={comparison}
        detailClassName={change > 0 ? 'font-medium text-success' : undefined}
      />
    </div>
  )
}

function Stat({
  value,
  label,
  detail,
  valueClassName,
  detailClassName,
}: {
  value: string | number
  label: string
  detail: string
  valueClassName?: string
  detailClassName?: string
}) {
  return (
    // 06-Progress: three cards fit 390 px with each value on one line ("7 h 40 m").
    <div className="flex min-w-0 flex-col rounded-3xl border bg-card px-3 py-3">
      <span
        className={cn(
          'text-xl leading-tight font-bold tracking-tight whitespace-nowrap tabular-nums',
          valueClassName,
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[0.8125rem] leading-snug">{label}</span>
      <span className={cn('text-[0.8125rem] leading-snug text-muted-foreground', detailClassName)}>
        {detail}
      </span>
    </div>
  )
}
