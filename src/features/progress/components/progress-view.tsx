'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Segmented } from '@/components/shared/segmented'
import { WeekBars } from '@/components/shared/week-bars'
import { progressQuery } from '../queries'
import type { ProgressView as View } from '../types'
import { ForecastList } from './forecast-list'
import { HeatCalendar } from './heat-calendar'
import { StatCards } from './stat-cards'

// The Progress tab (screen 06-Progress; spec 004 US3 scenarios 1–2; research.md R5): Week / Month in
// the URL (`?view=`), the stat cards, the heat calendar or the week's bars, and the finish forecast.

export function ProgressView({ view }: { view: View }) {
  const t = useTranslations('progress')
  const tc = useTranslations('studentCourses')
  const router = useRouter()
  const [, startTransition] = useTransition()
  // The toggle moves at once; the page follows when the other view's data has loaded.
  const [shownView, setShownView] = useOptimistic(view)
  const { data } = useSuspenseQuery(progressQuery(view))

  const setView = (next: View) =>
    startTransition(() => {
      setShownView(next)
      router.replace(`/s/progress?view=${next}`, { scroll: false })
    })

  return (
    <div className="flex flex-col gap-5 pb-6">
      <PageHeader
        title={t('title')}
        actions={
          <Segmented
            name="progress-view"
            legend={t('view')}
            value={shownView}
            onChange={setView}
            options={[
              { value: 'week', label: t('week') },
              { value: 'month', label: t('month') },
            ]}
            className="w-44"
          />
        }
      />
      <StatCards data={data} view={view} />
      {view === 'month' ? (
        <HeatCalendar today={data.today} days={data.days} goal={data.goal} />
      ) : (
        <section className="rounded-3xl border bg-card p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            {t('weeklyGoal', { count: data.goal.activeThisWeek, goal: data.goal.days })}
          </p>
          <WeekBars days={data.days} today={data.today} label={t('weekBars')} />
        </section>
      )}
      {data.courses.length > 0 ? (
        <ForecastList courses={data.courses} />
      ) : (
        <EmptyState icon={BookOpen}>{tc('empty')}</EmptyState>
      )}
    </div>
  )
}
