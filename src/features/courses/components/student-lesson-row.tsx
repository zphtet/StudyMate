'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { StatusChip } from '@/components/shared/status-chip'
import { cn } from '@/lib/utils'
import type { StudentLessonRow as Row } from '../types'
import { useCalendarDate } from './use-calendar-date'

// One lesson on the student course screen (screen 09-Course, partial; FR-010): number circle,
// title, minutes, and for locked lessons the reason and a Locked chip. Locked rows are not links.

export function StudentLessonRow({ lesson }: { lesson: Row }) {
  const t = useTranslations('studentCourses')
  const calendarDate = useCalendarDate()
  const locked = lesson.state === 'locked'

  const reason =
    lesson.lock?.reason === 'after_previous'
      ? t('unlocksAfter', { number: lesson.lock.previous.number })
      : lesson.lock?.reason === 'on_date'
        ? t('opensOn', { date: calendarDate(lesson.lock.date) })
        : null

  const content = (
    <>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full font-semibold',
          locked ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground',
        )}
      >
        {lesson.number}
      </span>
      <span className="min-w-0 flex-1">
        <span
          data-testid="student-lesson-title"
          className={cn('block leading-snug font-semibold', locked && 'text-muted-foreground')}
        >
          {lesson.title}
        </span>
        <span className="mt-0.5 block text-[0.95rem] text-muted-foreground">
          {t('minutes', { count: lesson.estMinutes })}
          {reason && ` · ${reason}`}
        </span>
      </span>
      {locked && <StatusChip tone="muted">{t('locked')}</StatusChip>}
    </>
  )

  const rowClass = 'flex min-h-18 items-center gap-4 px-4 py-3'
  return (
    <li className="border-b last:border-b-0">
      {locked ? (
        <div data-testid="student-lesson-row" aria-disabled="true" className={rowClass}>
          {content}
        </div>
      ) : (
        <Link
          href={`/s/lessons/${lesson.id}`}
          data-testid="student-lesson-row"
          className={cn(
            rowClass,
            'outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
          )}
        >
          {content}
        </Link>
      )}
    </li>
  )
}
