'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { BookOpen, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { ProgressBar } from '@/components/shared/progress-bar'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { COURSE_COLOR_CLASSES } from '@/features/courses/components/course-icon'
import { cityOf } from '@/lib/time'
import { cn } from '@/lib/utils'
import { adminStudentQuery } from '../queries'
import type { AdminStudentDetail } from '../types'
import { SubmissionStatusChip } from './submission-status-chip'

// The Admin's view of one student (contracts/ui-routes.md › Student; no screenshot, 002's course
// screen layout): "To review" first, oldest first, then each assigned course with its progress and
// lessons, each with its submission chip (never a Draft), linking to the review screen.

export function StudentDetail({
  studentId,
  menu,
}: {
  studentId: string
  /** Controls for the header's right side, e.g. ⋯ → Remove student (spec 001). */
  menu?: ReactNode
}) {
  const t = useTranslations('adminStudents')
  const { data } = useSuspenseQuery(adminStudentQuery(studentId))
  const { student } = data

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 pt-5">
        <div className="flex items-center justify-between">
          <Link
            href="/a/students"
            aria-label={t('back')}
            className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          {menu}
        </div>
        <div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
            {student.displayName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t('cityTime', { city: cityOf(student.timezone) })}
          </p>
        </div>
      </header>

      {data.toReview.length > 0 && <ToReview studentId={student.id} items={data.toReview} />}

      {data.courses.length === 0 ? (
        <EmptyState icon={BookOpen}>{t('noCourses')}</EmptyState>
      ) : (
        data.courses.map((course) => (
          <CourseSection key={course.courseId} studentId={student.id} course={course} />
        ))
      )}
    </div>
  )
}

function CourseSection({
  studentId,
  course,
}: {
  studentId: string
  course: AdminStudentDetail['courses'][number]
}) {
  const t = useTranslations('adminStudents')
  const headingId = `course-${course.courseId}`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {course.title}
        </h2>
        <span className="font-semibold tabular-nums">
          {course.percent === null ? '—' : t('percent', { percent: course.percent })}
        </span>
      </div>
      <ProgressBar
        percent={course.percent}
        label={course.title}
        fillClassName={COURSE_COLOR_CLASSES[course.color].solid}
      />
      <ul className="overflow-hidden rounded-3xl border bg-card">
        {course.lessons.map((lesson) => (
          <li key={lesson.id} className="border-b last:border-b-0">
            <Link
              href={`/a/students/${studentId}/lessons/${lesson.id}`}
              className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  lesson.done ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
                )}
              >
                {lesson.done ? <Check className="size-4" aria-label={t('done')} /> : lesson.number}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{lesson.title}</span>
              {lesson.submission && <SubmissionStatusChip status={lesson.submission} />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ToReview({
  studentId,
  items,
}: {
  studentId: string
  items: AdminStudentDetail['toReview']
}) {
  const t = useTranslations('adminStudents')
  const f = useInstantFormat()
  return (
    <section aria-labelledby="to-review" className="flex flex-col gap-3">
      <h2 id="to-review" className="text-lg font-semibold">
        {t('toReview', { count: items.length })}
      </h2>
      <ul className="overflow-hidden rounded-3xl border bg-card">
        {items.map((item) => (
          <li key={item.submissionId} className="border-b last:border-b-0">
            <Link
              href={`/a/students/${studentId}/lessons/${item.lessonId}`}
              className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{item.lessonTitle}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {t('submittedRelative', {
                    course: item.courseTitle,
                    time: f.dayTime(item.submittedAt),
                  })}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
