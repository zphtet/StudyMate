'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { UsersRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { EmptyState } from '@/components/shared/empty-state'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { ProgressBar } from '@/components/shared/progress-bar'
import { StatusChip } from '@/components/shared/status-chip'
import { useDuration } from '@/components/shared/use-duration'
import { COURSE_COLOR_CLASSES } from '@/features/courses/components/course-icon'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { adminProgressKeys, studentCardsQuery } from '../queries'
import type { AdminStudentCard, CourseProgress } from '../types'

// Admin Students tab cards (screen 16-AdminStudents, partial per contracts/ui-routes.md): one card per
// linked student with "{n} overdue" and "{n} to review", tiles for the day streak, this week's time
// and lessons done (the student's own Mon–Sun), and per-course progress bars. The student's name is
// the card's link and covers the whole card. New submissions and completions arrive live
// (research.md R10; SC-002): RLS limits the events to linked students' visible rows.

export function StudentCardList() {
  const t = useTranslations('students')
  const { data } = useSuspenseQuery(studentCardsQuery)
  const queryKeys = [adminProgressKeys.cards]
  // Only a submit adds to "to review"; the Admin's own reviews refetch through their mutation.
  useRealtimeInvalidate({
    table: 'submissions',
    queryKeys,
    when: (row) => row.status === 'submitted',
  })
  useRealtimeInvalidate({ table: 'lesson_progress', queryKeys })
  if (data.students.length === 0) {
    return (
      <EmptyState icon={UsersRound} title={t('emptyTitle')}>
        {t('emptyBody')}
      </EmptyState>
    )
  }
  return (
    <ul className="flex flex-col gap-4">
      {data.students.map((student) => (
        <li key={student.id}>
          <StudentProgressCard student={student} />
        </li>
      ))}
    </ul>
  )
}

function StudentProgressCard({ student }: { student: AdminStudentCard }) {
  const t = useTranslations('adminStudents')
  const duration = useDuration()
  return (
    <article
      aria-label={student.displayName}
      className="relative flex flex-col gap-4 rounded-3xl border bg-card p-5 hover:bg-muted/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-3">
        <InitialAvatar name={student.displayName} seed={student.id} className="size-12" />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {/* The name is the link; it covers the whole card, so the card is one tap target. */}
          <Link
            href={`/a/students/${student.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-3xl"
          >
            {student.displayName}
          </Link>
        </h2>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {student.overdueCount > 0 && (
            <StatusChip tone="danger">{t('overdue', { count: student.overdueCount })}</StatusChip>
          )}
          {student.toReview > 0 && (
            <StatusChip tone="accent">{t('toReviewChip', { count: student.toReview })}</StatusChip>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Tile value={student.streak.current} label={t('tileStreak')} />
        <Tile value={duration(student.weekSeconds)} label={t('tileWeek')} />
        <Tile value={student.weekLessonsDone} label={t('tileLessons')} />
      </dl>
      {student.courses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {student.courses.map((course) => (
            <CourseRow key={course.courseId} course={course} />
          ))}
        </ul>
      )}
    </article>
  )
}

export function CourseRow({ course }: { course: CourseProgress }) {
  const t = useTranslations('adminStudents')
  return (
    <li className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_3rem] items-center gap-3">
      <span className="truncate">{course.title}</span>
      <ProgressBar
        percent={course.percent}
        label={course.title}
        fillClassName={COURSE_COLOR_CLASSES[course.color].solid}
      />
      <span className="text-right font-medium tabular-nums">
        {course.percent === null ? '—' : t('percent', { percent: course.percent })}
      </span>
    </li>
  )
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse rounded-2xl bg-muted px-3 py-2.5">
      <dt className="truncate text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold tracking-tight tabular-nums">{value}</dd>
    </div>
  )
}
