'use client'

import { useTranslations } from 'next-intl'
import { ProgressBar } from '@/components/shared/progress-bar'
import { useCalendarDate } from '@/components/shared/use-calendar-date'
import { COURSE_COLOR_CLASSES } from '@/features/courses/components/course-icon'
import { cn } from '@/lib/utils'
import type { Forecast, ProgressResponse } from '../types'

// "Courses · finish forecast" (screen 06-Progress; research.md R6): one row per active course with
// its percent, a bar in the course colour and the forecast line (texts and tones per
// contracts/ui-routes.md › Progress).

const TONE: Record<Forecast['kind'], string> = {
  on_track: 'text-success',
  finished: 'text-success',
  behind: 'text-warning-foreground',
  no_deadline: 'text-muted-foreground',
  no_pace: 'text-muted-foreground',
  empty: 'text-muted-foreground',
}

export function ForecastList({ courses }: { courses: ProgressResponse['courses'] }) {
  const t = useTranslations('progress')
  const date = useCalendarDate()

  const line = (f: Forecast) => {
    switch (f.kind) {
      case 'on_track':
      case 'behind':
        return t(`forecast.${f.kind}`, {
          finish: date(f.finishOn, false),
          due: date(f.dueOn, false),
        })
      case 'no_deadline':
      case 'no_pace':
        return t(`forecast.${f.kind}`, { count: f.remaining })
      default:
        return t(`forecast.${f.kind}`)
    }
  }

  return (
    <section aria-labelledby="forecast-heading" className="flex flex-col gap-3">
      <h2 id="forecast-heading" className="text-lg font-semibold">
        {t('forecastTitle')}
      </h2>
      <ul className="overflow-hidden rounded-3xl border bg-card">
        {courses.map((course) => (
          <li
            key={course.courseId}
            className="flex flex-col gap-2 border-b px-4 py-4 last:border-b-0"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[1.0625rem] font-semibold">
                {course.title}
              </span>
              <span className="font-semibold tabular-nums">
                {course.percent === null ? '—' : t('percent', { percent: course.percent })}
              </span>
            </div>
            <ProgressBar
              percent={course.percent}
              label={course.title}
              fillClassName={COURSE_COLOR_CLASSES[course.color].solid}
            />
            <p className={cn('text-sm font-medium', TONE[course.forecast.kind])}>
              {line(course.forecast)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
