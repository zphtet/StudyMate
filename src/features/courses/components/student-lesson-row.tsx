'use client'

import { Check } from 'lucide-react'
import { useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { StatusChip } from '@/components/shared/status-chip'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { DueChip } from '@/features/assignments/components/due-chip'
import { calendarDaysBetween, utcToZoned } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { StudentLessonRow as Row } from '../types'
import { useCalendarDate } from '@/components/shared/use-calendar-date'

// One lesson on the student course screen (screen 09-Course, partial): number circle, title, minutes
// and a detail line, plus a chip. Spec 003 (contracts/ui-routes.md › Course screen) adds the deadline
// chip, detail line and circle colour; without an effective deadline the row is 002's Open/Locked.
// Locked rows are not links.

/** From this local hour a deadline today reads "21:00 tonight"; earlier ones "09:00 today". */
const EVENING_HOUR = 17

const CIRCLE = {
  done: 'bg-success-soft text-success',
  overdue: 'bg-destructive-soft text-destructive',
  due_soon: 'bg-warning text-warning-foreground',
  upcoming: 'bg-muted text-muted-foreground',
  locked: 'bg-muted text-muted-foreground',
} as const

function circleClass({ due, state }: Row) {
  if (due && due.status !== 'none') return CIRCLE[due.status]
  return state === 'locked' ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground'
}

export function StudentLessonRow({ lesson }: { lesson: Row }) {
  const t = useTranslations('studentCourses')
  const calendarDate = useCalendarDate()
  const f = useInstantFormat()
  const now = useNow({ updateInterval: 60_000 })
  const locked = lesson.state === 'locked'
  const due = lesson.due

  const reason =
    lesson.lock?.reason === 'after_previous'
      ? t('unlocksAfter', { number: lesson.lock.previous.number })
      : lesson.lock?.reason === 'on_date'
        ? t('opensOn', { date: calendarDate(lesson.lock.date) })
        : null

  const dueDetail = (() => {
    if (due?.status === 'overdue') return t('wasDue', { date: f.day(due.dueAt) })
    if (due?.status !== 'due_soon') return null
    const time = f.time(due.dueAt)
    if (calendarDaysBetween(now, new Date(due.dueAt), f.viewerZone) !== 0) return time
    const hour = Number(utcToZoned(due.dueAt, f.viewerZone).time.slice(0, 2))
    return hour >= EVENING_HOUR ? t('tonight', { time }) : t('todayAt', { time })
  })()
  const detail = due?.status === 'done' ? null : (dueDetail ?? reason)

  const content = (
    <>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full font-semibold',
          circleClass(lesson),
        )}
      >
        {lesson.done ? <Check className="size-5" aria-hidden /> : lesson.number}
        {lesson.done && <span className="sr-only">{lesson.number}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span
          data-testid="student-lesson-title"
          className={cn(
            'block leading-snug font-semibold',
            (locked || lesson.done) && 'text-muted-foreground',
          )}
        >
          {lesson.title}
        </span>
        <span className="mt-0.5 block text-[0.95rem] text-muted-foreground">
          {t('minutes', { count: lesson.estMinutes })}
          {detail && ` · ${detail}`}
        </span>
      </span>
      {due && due.status !== 'none' ? (
        <DueChip due={due} />
      ) : (
        locked && <StatusChip tone="muted">{t('locked')}</StatusChip>
      )}
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
