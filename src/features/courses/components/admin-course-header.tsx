'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronLeft, EyeOff, Pencil } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { toast } from 'sonner'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { setCourseStatus } from '../actions'
import { courseKeys } from '../queries'
import type { AdminCourseDetail, CourseStatus } from '../types'
import { CourseIcon } from './course-icon'

// Top of the admin course page (screen 18-AdminCourse): back, Edit details, icon, title, status,
// counts, and the Draft / Archived banners (US1 scenario 3; US3 scenario 4).

const TONE = { draft: 'muted', active: 'success', archived: 'muted' } as const

export function AdminCourseHeader({ detail }: { detail: AdminCourseDetail }) {
  const t = useTranslations('courseDetail')
  const format = useFormatter()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { course, students } = detail

  const status = useMutation({
    mutationFn: async (next: CourseStatus) =>
      unwrap(await setCourseStatus({ courseId: course.id, status: next })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.admin }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const target = course.targetDate
    ? format.dateTime(new Date(`${course.targetDate}T00:00:00Z`), {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : null

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between pt-5">
        <Link
          href="/a/courses"
          aria-label={t('back')}
          className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <Button asChild variant="outline" size="touch" className="rounded-xl">
          <Link href={`/a/courses/${course.id}/edit`}>
            <Pencil aria-hidden /> {t('editDetails')}
          </Link>
        </Button>
      </header>

      <div className="flex items-center gap-4">
        <CourseIcon icon={course.icon} color={course.color} size="lg" />
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{course.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            <StatusChip tone={TONE[course.status]}>{t(`status.${course.status}`)}</StatusChip>
            <span>
              {t('lessonCount', { count: course.lessonCount })}
              {target && ` · ${t('target', { date: target })}`}
            </span>
          </p>
        </div>
      </div>

      {students.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <div className="flex -space-x-2">
            {students.slice(0, 3).map((s) => (
              <InitialAvatar
                key={s.id}
                name={s.displayName}
                seed={s.id}
                className="ring-2 ring-card"
              />
            ))}
          </div>
          <p className="min-w-0 flex-1 truncate text-muted-foreground">
            {students
              .map((s) => (s.percent === null ? s.displayName : `${s.displayName} ${s.percent}%`))
              .join(' · ')}
          </p>
        </div>
      )}

      {course.status === 'draft' && (
        <div className="flex items-center gap-3 rounded-2xl bg-accent p-4 text-accent-foreground">
          <EyeOff className="size-5 shrink-0" aria-hidden />
          <p className="flex-1">{t('draftBanner')}</p>
          <Button size="touch" disabled={status.isPending} onClick={() => status.mutate('active')}>
            {t('makeActive')}
          </Button>
        </div>
      )}
      {course.status === 'archived' && (
        <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
          <Archive className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="flex-1 text-muted-foreground">{t('archivedBanner')}</p>
          <Button
            variant="outline"
            size="touch"
            disabled={status.isPending}
            onClick={() => status.mutate('active')}
          >
            {t('unarchive')}
          </Button>
        </div>
      )}
    </div>
  )
}
