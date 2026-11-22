'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { useTimeBoth } from '@/components/shared/time-both'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { setLessonDone } from '../actions'
import { adminProgressKeys } from '../queries'
import type { AdminLessonReview } from '../types'

// The Admin's Mark done / Reopen on the review screen (US1 scenario 4, FR-002; contracts/ui-routes.md
// › Lesson review). Optimistic with rollback; the server writes the audit row. The date is the
// student's time with the Admin's beside it when they differ (constitution IV).

export function ReviewBar({ review }: { review: AdminLessonReview }) {
  const t = useTranslations('adminStudents')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const timeBoth = useTimeBoth()
  const { student, lesson, progress } = review
  const key = adminProgressKeys.lesson(student.id, lesson.id)

  const mark = useMutation({
    mutationFn: async (done: boolean) =>
      unwrap(await setLessonDone({ studentId: student.id, lessonId: lesson.id, done })),
    onMutate: async (done) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<AdminLessonReview>(key)
      queryClient.setQueryData<AdminLessonReview>(
        key,
        (old) =>
          old && {
            ...old,
            progress: {
              done,
              completedAt: done ? new Date().toISOString() : null,
              completedByName: null,
            },
          },
      )
      return { snapshot }
    },
    onError: (error, _done, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot)
      toast.error(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminProgressKeys.all }),
  })

  if (!review.courseActive) return null
  return (
    <BottomBar>
      <section aria-label={t('actions')} className="flex w-full items-center gap-3">
        {progress.done ? (
          <>
            <p className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-success">
              <Check className="size-5 shrink-0" aria-hidden />
              {/* Two lines: the time with both clocks doesn't fit beside Reopen at 390 px. */}
              <span className="min-w-0">
                {progress.completedAt && progress.completedByName ? (
                  <>
                    {t('doneBy', { name: progress.completedByName })}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {timeBoth(progress.completedAt, student.timezone)}
                    </span>
                  </>
                ) : (
                  t('done')
                )}
              </span>
            </p>
            <Button
              variant="outline"
              size="touch"
              disabled={mark.isPending}
              onClick={() => mark.mutate(false)}
            >
              {t('reopen')}
            </Button>
          </>
        ) : (
          <Button
            size="xl"
            className="flex-1"
            disabled={mark.isPending}
            onClick={() => mark.mutate(true)}
          >
            <Check aria-hidden />
            {t('markDone')}
          </Button>
        )}
      </section>
    </BottomBar>
  )
}
