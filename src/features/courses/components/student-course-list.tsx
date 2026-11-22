'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { ProgressBar } from '@/components/shared/progress-bar'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { cn } from '@/lib/utils'
import { studentCoursesQuery } from '../queries'
import type { StudentCourseCard } from '../types'
import { COURSE_COLOR_CLASSES, CourseIcon } from './course-icon'
import { useCalendarDate } from './use-calendar-date'

// Student Courses tab (screen 05-Courses, partial per contracts/ui-routes.md): chips Active · n and
// Archived · n (only when there are any), and one card per assigned course. Active cards show the
// student's course deadline and a red overdue count (spec 003 US3 scenario 5), and from spec 004 the
// progress bar, "{percent}%" and "{done} of {total}" (FR-005). The weekly study card comes with 004
// US3; Completed and Mine with the personal-courses feature.

export function StudentCourseList() {
  const t = useTranslations('studentCourses')
  const { data } = useSuspenseQuery(studentCoursesQuery)
  const [tab, setTab] = useState<'active' | 'archived'>('active')

  if (data.active.length === 0 && data.archived.length === 0) {
    return <EmptyState icon={BookOpen}>{t('empty')}</EmptyState>
  }
  const shown = tab === 'archived' ? data.archived : data.active
  const tabs = (['active', 'archived'] as const).filter(
    (key) => key === 'active' || data.archived.length > 0,
  )

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t('filters')} className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 font-medium whitespace-nowrap',
              tab === key
                ? 'border-inverse bg-inverse text-inverse-foreground'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(key, { count: data[key].length })}
          </button>
        ))}
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map((course) => (
            <li key={course.id}>
              <CourseLink course={course} archived={tab === 'archived'} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={BookOpen}>{t('emptyActive')}</EmptyState>
      )}
    </div>
  )
}

function CourseLink({ course, archived }: { course: StudentCourseCard; archived: boolean }) {
  const t = useTranslations('studentCourses')
  const calendarDate = useCalendarDate()
  const f = useInstantFormat()
  return (
    <Link
      href={`/s/courses/${course.id}`}
      className="flex items-center gap-4 rounded-3xl border bg-card p-5 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CourseIcon icon={course.icon} color={course.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg leading-snug font-semibold">{course.title}</h2>
          {!archived && (
            <span className="shrink-0 font-semibold tabular-nums">
              {course.percent === null ? '—' : t('percent', { percent: course.percent })}
            </span>
          )}
        </div>
        {!archived && (
          <ProgressBar
            percent={course.percent}
            label={course.title}
            fillClassName={COURSE_COLOR_CLASSES[course.color].solid}
            className="my-2"
          />
        )}
        <p className="text-muted-foreground">
          {archived
            ? t('lessonCount', { count: course.lessonCount })
            : t('doneOf', { done: course.doneCount, total: course.lessonCount })}
          {archived
            ? course.targetDate && ` · ${t('finishBy', { date: calendarDate(course.targetDate) })}`
            : ' · '}
          {!archived && (
            <span className="whitespace-nowrap">
              {course.dueAt ? t('due', { date: f.date(course.dueAt) }) : t('noDeadline')}
            </span>
          )}
          {course.overdueCount > 0 && (
            <span className="font-medium whitespace-nowrap text-destructive">
              {` · ${t('overdueCount', { count: course.overdueCount })}`}
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}
