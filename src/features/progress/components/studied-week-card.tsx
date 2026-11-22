'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useDuration } from '@/components/shared/use-duration'
import { WeekBars } from '@/components/shared/week-bars'
import { progressQuery } from '../queries'

// "Studied this week" on the Courses tab (screen 05-Courses; research.md R5): the week's time, lessons
// done and seven bars, from the Progress Week data.

export function StudiedWeekCard() {
  const t = useTranslations('progress')
  const duration = useDuration()
  const { data } = useSuspenseQuery(progressQuery('week'))
  return (
    <section aria-labelledby="studied-week" className="rounded-3xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="studied-week" className="text-sm text-muted-foreground">
            {t('studiedWeek')}
          </h2>
          <p className="text-3xl font-bold tracking-tight">{duration(data.studied.seconds)}</p>
        </div>
        <p className="font-medium text-success">
          {t('weekLessons', { count: data.lessonsDone.count })}
        </p>
      </div>
      <WeekBars days={data.days} today={data.today} label={t('weekBars')} />
    </section>
  )
}
