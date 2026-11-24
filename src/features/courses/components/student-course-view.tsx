'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Archive, BookOpen, ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useId } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { ProgressBar } from '@/components/shared/progress-bar'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { studentCourseQuery } from '../queries'
import { useKeepCourseOffline } from '../use-keep-course-offline'
import type { StudentCourse } from '../types'
import { COURSE_COLOR_CLASSES } from './course-icon'
import { StudentLessonRow } from './student-lesson-row'

// Student course screen (screen 09-Course, partial per contracts/ui-routes.md and FR-010): title,
// "Assigned by … · finish by {the student's course deadline}" (spec 003 US3 scenario 4), the Archived
// banner, the progress card (spec 004 FR-005), then sections with lessons in course order and their
// deadline chips (003).

export function StudentCourseView({ courseId }: { courseId: string }) {
  const t = useTranslations('studentCourses')
  const f = useInstantFormat()
  const { data } = useSuspenseQuery(studentCourseQuery(courseId))
  useKeepCourseOffline(data)
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
            {course.dueAt && ` · ${t('finishBy', { date: f.fullDate(course.dueAt) })}`}
          </p>
        </div>
      </header>

      {!archived && <ProgressCard course={course} />}

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

function ProgressCard({ course }: { course: StudentCourse['course'] }) {
  const t = useTranslations('studentCourses')
  const { percent, done, total } = course.progress
  return (
    <section
      aria-label={t('progress')}
      className="flex flex-col gap-3 rounded-3xl border bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground">{t('lessonsDoneOf', { done, total })}</p>
        <p className="text-2xl font-bold tabular-nums">
          {percent === null ? '—' : t('percent', { percent })}
        </p>
      </div>
      <ProgressBar
        percent={percent}
        label={course.title}
        fillClassName={COURSE_COLOR_CLASSES[course.color].solid}
      />
    </section>
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
