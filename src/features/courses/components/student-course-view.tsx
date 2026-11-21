'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Archive, BookOpen, ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useId } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { studentCourseQuery } from '../queries'
import type { StudentCourse } from '../types'
import { StudentLessonRow } from './student-lesson-row'
import { useCalendarDate } from './use-calendar-date'

// Student course screen (screen 09-Course, partial per contracts/ui-routes.md and FR-010): title,
// "Assigned by …", the Archived banner, then sections with lessons in course order, Open or Locked.
// The progress card and due / overdue / done chips come with 003 and 004.

export function StudentCourseView({ courseId }: { courseId: string }) {
  const t = useTranslations('studentCourses')
  const calendarDate = useCalendarDate()
  const { data } = useSuspenseQuery(studentCourseQuery(courseId))
  const { course } = data
  const archived = course.status === 'archived'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 pt-5">
        <Link
          href="/s/courses"
          aria-label={t('back')}
          className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{course.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {t('assignedBy', { name: course.admin.displayName })}
            {course.targetDate && ` · ${t('finishBy', { date: calendarDate(course.targetDate) })}`}
          </p>
        </div>
      </header>

      {archived && (
        <div className="flex items-center gap-3 rounded-2xl bg-muted p-4 text-muted-foreground">
          <Archive className="size-5 shrink-0" aria-hidden />
          <p>{t('archivedBanner')}</p>
        </div>
      )}

      {data.lessonCount === 0 ? (
        <EmptyState icon={BookOpen}>{archived ? t('noCompleted') : t('noLessons')}</EmptyState>
      ) : (
        data.groups.map((group) => <LessonGroup key={group.section?.id ?? 'none'} group={group} />)
      )}
    </div>
  )
}

function LessonGroup({ group }: { group: StudentCourse['groups'][number] }) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={group.section ? headingId : undefined}
      data-testid="student-lesson-group"
      data-section-title={group.section?.title ?? ''}
      className="flex flex-col gap-3"
    >
      {group.section && (
        <h2 id={headingId} className="text-lg font-semibold text-muted-foreground">
          {group.section.title}
        </h2>
      )}
      <ul className="overflow-hidden rounded-3xl border bg-card">
        {group.lessons.map((lesson) => (
          <StudentLessonRow key={lesson.id} lesson={lesson} />
        ))}
      </ul>
    </section>
  )
}
