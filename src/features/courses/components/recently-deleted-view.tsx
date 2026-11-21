'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { restoreCourse } from '../actions'
import { restoreLesson } from '../lesson-actions'
import { courseKeys, recentlyDeletedQuery } from '../queries'
import { CourseIcon } from './course-icon'

// Recently deleted (US3 scenario 3; contracts/ui-routes.md): courses and lessons deleted in the
// last 30 days, each with when it goes for good (viewer's time zone) and Restore.

export function RecentlyDeletedView() {
  const t = useTranslations('recentlyDeleted')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(recentlyDeletedQuery)

  const restore = useMutation({
    mutationFn: async (item: { kind: 'course' | 'lesson'; id: string }) =>
      unwrap(
        item.kind === 'course'
          ? await restoreCourse({ courseId: item.id })
          : await restoreLesson({ lessonId: item.id }),
      ),
    // Restoring touches lists, course pages and this page, so refresh everything under courses/admin.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      toast.success(t('restored'))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const meta = (deletedAt: string, purgeAt: string) =>
    t('meta', {
      relative: format.relativeTime(new Date(deletedAt), now),
      date: format.dateTime(new Date(purgeAt), { day: 'numeric', month: 'short', year: 'numeric' }),
    })

  const restoreButton = (kind: 'course' | 'lesson', id: string, title: string) => (
    <Button
      variant="outline"
      size="touch"
      aria-label={t('restoreLabel', { title })}
      disabled={restore.isPending && restore.variables?.id === id}
      onClick={() => restore.mutate({ kind, id })}
    >
      {t('restore')}
    </Button>
  )

  const empty = data.courses.length === 0 && data.lessons.length === 0

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex items-center gap-2 pt-5">
        <Link
          href="/a/courses"
          aria-label={t('back')}
          className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{t('title')}</h1>
      </header>
      <p className="text-muted-foreground">{t('intro')}</p>

      {empty && <EmptyState icon={Trash2}>{t('empty')}</EmptyState>}

      {data.courses.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="deleted-courses">
          <h2 id="deleted-courses" className="font-semibold text-muted-foreground">
            {t('courses')}
          </h2>
          <ul className="flex flex-col gap-3">
            {data.courses.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
                <div className="flex items-center gap-4">
                  <CourseIcon icon={c.icon} color={c.color} />
                  <p className="min-w-0 flex-1 font-semibold">{c.title}</p>
                  {restoreButton('course', c.id, c.title)}
                </div>
                <p className="text-sm text-muted-foreground">{meta(c.deletedAt, c.purgeAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.lessons.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="deleted-lessons">
          <h2 id="deleted-lessons" className="font-semibold text-muted-foreground">
            {t('lessons')}
          </h2>
          <ul className="flex flex-col gap-3">
            {data.lessons.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{l.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {t('inCourse', { course: l.course.title })}
                    </p>
                  </div>
                  {restoreButton('lesson', l.id, l.title)}
                </div>
                <p className="text-sm text-muted-foreground">{meta(l.deletedAt, l.purgeAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
