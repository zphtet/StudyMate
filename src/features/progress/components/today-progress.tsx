'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Flame, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ProgressBar } from '@/components/shared/progress-bar'
import { cn } from '@/lib/utils'
import { summaryQuery } from '../queries'

// Today's progress cards (screen 04-Today; contracts/ui-routes.md › Today; research.md R13): the study
// streak and "{n} of {goal}" study days this week side by side, and Continue below 003's sections.
// The goal shows one pill per goal day, filled for each active day, as in the screenshot.

export function StreakAndGoalCards() {
  const t = useTranslations('todayProgress')
  const { data } = useSuspenseQuery(summaryQuery)
  const { activeDays, goal } = data.week
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
        <Flame className="size-6 text-course-rust" aria-hidden />
        <p className="text-2xl font-bold tracking-tight">
          {t('streakDays', { count: data.streak.current })}
        </p>
        <p className="text-sm text-muted-foreground">{t('streak')}</p>
      </div>
      <div className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
        <div className="flex h-6 items-center gap-1.5" aria-hidden>
          {Array.from({ length: goal }, (_, i) => (
            <span
              key={i}
              className={cn('h-2 flex-1 rounded-full', i < activeDays ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>
        <p className="text-2xl font-bold tracking-tight">
          {t('goal', { count: activeDays, goal })}
        </p>
        <p className="text-sm text-muted-foreground">{t('goalLabel')}</p>
      </div>
    </div>
  )
}

export function ContinueCard() {
  const t = useTranslations('todayProgress')
  const { data } = useSuspenseQuery(summaryQuery)
  const next = data.continue
  if (!next) return null
  const percent = next.total > 0 ? Math.round((next.done / next.total) * 100) : null
  return (
    <section aria-labelledby="continue-heading" className="flex flex-col gap-3">
      <h2 id="continue-heading" className="text-lg font-semibold">
        {t('continue')}
      </h2>
      <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[1.0625rem] font-semibold">
              {t('continueLesson', { number: next.number, lesson: next.lessonTitle })}
            </p>
            <p className="truncate text-muted-foreground">
              {t('continueCourse', {
                course: next.courseTitle,
                done: next.done,
                total: next.total,
              })}
            </p>
          </div>
          <Link
            href={`/s/lessons/${next.lessonId}`}
            aria-label={t('continueAction', { lesson: next.lessonTitle })}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Play className="size-5 fill-current" aria-hidden />
          </Link>
        </div>
        <ProgressBar percent={percent} label={next.courseTitle} />
      </div>
    </section>
  )
}
