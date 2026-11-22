'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronLeft, Clock, ClipboardList, ExternalLink, FileText, Lock } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Markdown } from '@/components/shared/markdown'
import { Button } from '@/components/ui/button'
import { studentLessonQuery } from '../queries'
import type { LockInfo, Resource, StudentLesson } from '../types'
import { useCalendarDate } from '@/components/shared/use-calendar-date'

// Student lesson screen (screen 10-Lesson, partial per contracts/ui-routes.md; US4 scenario 3):
// "{course} · Lesson n of m", title, minutes, the shared Markdown body, attachments and the
// assignment prompt. Spec 004 wraps the body in its tabs (`wrapBody`, from LessonWorkScreen) and shows
// the assignment on its own tab instead (`showAssignment`).

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
    >
      <ChevronLeft className="size-6" aria-hidden />
    </Link>
  )
}

export function StudentLessonView({
  lessonId,
  wrapBody = (body) => body,
  showAssignment = true,
}: {
  lessonId: string
  /** Puts the lesson body inside another layout (spec 004 tabs). */
  wrapBody?: (body: ReactNode, lesson: StudentLesson) => ReactNode
  /** The assignment prompt under the content; spec 004 has an Assignment tab instead. */
  showAssignment?: boolean
}) {
  const t = useTranslations('lessonView')
  const { data: lesson } = useSuspenseQuery(studentLessonQuery(lessonId))

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 pt-5">
        <div className="flex items-center gap-2">
          <BackLink href={`/s/courses/${lesson.course.id}`} label={t('back')} />
          <p className="min-w-0 truncate text-muted-foreground">
            {t('position', {
              course: lesson.course.title,
              number: lesson.number,
              total: lesson.total,
            })}
          </p>
        </div>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{lesson.title}</h1>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          {t('minutes', { count: lesson.estMinutes })}
        </p>
      </header>

      {wrapBody(<LessonBody lesson={lesson} showAssignment={showAssignment} />, lesson)}
    </div>
  )
}

function LessonBody({
  lesson,
  showAssignment,
}: {
  lesson: StudentLesson
  showAssignment: boolean
}) {
  const t = useTranslations('lessonView')
  return (
    <div className="flex flex-col gap-6">
      <article>
        <Markdown source={lesson.contentMd} />
      </article>

      {lesson.attachments.length > 0 && <Attachments attachments={lesson.attachments} />}

      {showAssignment && lesson.assignmentPrompt && (
        <section
          aria-labelledby="assignment-heading"
          className="flex gap-4 rounded-3xl border bg-card p-5"
        >
          <ClipboardList className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="assignment-heading" className="font-semibold">
              {t('assignment')}
            </h2>
            <p className="mt-1 whitespace-pre-wrap">{lesson.assignmentPrompt}</p>
            {lesson.requireSubmission && (
              <p className="mt-2 text-sm text-muted-foreground">{t('requireSubmission')}</p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function Attachments({ attachments }: { attachments: Resource[] }) {
  const t = useTranslations('lessonView')
  const format = useFormatter()
  const size = (bytes: number) =>
    bytes < 1024
      ? format.number(bytes, { style: 'unit', unit: 'byte', unitDisplay: 'short' })
      : bytes < 1024 * 1024
        ? format.number(bytes / 1024, {
            style: 'unit',
            unit: 'kilobyte',
            unitDisplay: 'short',
            maximumFractionDigits: 0,
          })
        : format.number(bytes / (1024 * 1024), {
            style: 'unit',
            unit: 'megabyte',
            unitDisplay: 'short',
            maximumFractionDigits: 1,
          })

  return (
    <section aria-labelledby="attachments-heading" className="flex flex-col gap-3">
      <h2 id="attachments-heading" className="font-semibold">
        {t('attachments')}
      </h2>
      <ul className="overflow-hidden rounded-3xl border bg-card">
        {attachments.map((resource) => (
          <li key={resource.id} className="border-b last:border-b-0">
            <a
              href={resource.url}
              target="_blank"
              rel={resource.kind === 'link' ? 'noopener noreferrer nofollow' : 'noopener'}
              className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              {resource.kind === 'link' ? (
                <ExternalLink className="size-5 shrink-0 text-primary" aria-hidden />
              ) : (
                <FileText className="size-5 shrink-0 text-primary" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{resource.name}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {resource.kind === 'link'
                  ? t('opensInNewTab')
                  : resource.sizeBytes !== null && size(resource.sizeBytes)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Shown instead of a lesson that isn't open yet (403 lesson_locked, research.md R1). */
export function LockedLesson({ courseId, lock }: { courseId: string; lock: LockInfo | null }) {
  const t = useTranslations('lessonView')
  const calendarDate = useCalendarDate()
  const courseUrl = `/s/courses/${courseId}`
  return (
    <div className="flex flex-col gap-6">
      <header className="pt-5">
        <BackLink href={courseUrl} label={t('back')} />
      </header>
      <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">{t('lockedTitle')}</h1>
        {lock && (
          <p className="max-w-xs text-muted-foreground">
            {lock.reason === 'after_previous'
              ? t('lockedAfter', { number: lock.previous.number, title: lock.previous.title })
              : t('lockedOnDate', { date: calendarDate(lock.date) })}
          </p>
        )}
        <Button asChild variant="outline" size="touch" className="mt-2">
          <Link href={courseUrl}>{t('backToCourse')}</Link>
        </Button>
      </div>
    </div>
  )
}
