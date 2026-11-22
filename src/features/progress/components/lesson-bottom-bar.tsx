'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { Button } from '@/components/ui/button'
import { todayKeys } from '@/features/assignments/queries'
import { ActionResultError, unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { completeLesson, undoCompletion } from '../actions'
import { lessonWorkKeys, lessonWorkQuery, progressKeys } from '../queries'
import type { LessonWork } from '../types'
import { useFocusTimer } from '../use-focus-timer'
import { FocusButton } from './focus-button'

// Lesson screen bottom bar (contracts/ui-routes.md › Bottom bar; US1). Mark complete and Undo update
// the lesson at once and roll back on error (SC-001, research.md R14); Today, Courses and Progress
// refetch. "Submit before complete" switches to the Assignment tab instead of showing an error.
// The focus timer (US4) sits on the left until the lesson is done; its countdown keeps running after.

export function LessonBottomBar({
  lessonId,
  onSubmissionRequired,
}: {
  lessonId: string
  onSubmissionRequired: () => void
}) {
  const t = useTranslations('lessonWork')
  const { data: work } = useSuspenseQuery(lessonWorkQuery(lessonId))
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const workKey = lessonWorkKeys.work(lessonId)
  const focus = useFocusTimer(lessonId)

  const optimistic = (done: boolean) => async () => {
    await queryClient.cancelQueries({ queryKey: workKey })
    const snapshot = queryClient.getQueryData<LessonWork>(workKey)
    queryClient.setQueryData<LessonWork>(
      workKey,
      (old) =>
        old && {
          ...old,
          progress: {
            ...old.progress,
            done,
            completedAt: done ? new Date().toISOString() : null,
            completedByName: null,
          },
        },
    )
    return { snapshot }
  }
  const settle = () =>
    Promise.all(
      // ['courses', 'student'] = every 002 student course query (list and course screens).
      [workKey, todayKeys.all, progressKeys.all, ['courses', 'student'] as const].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  const rollback = (context: { snapshot?: LessonWork } | undefined) => {
    if (context?.snapshot) queryClient.setQueryData(workKey, context.snapshot)
  }

  const complete = useMutation({
    mutationFn: async () => unwrap(await completeLesson({ lessonId })),
    onMutate: optimistic(true),
    onError: (error, _input, context) => {
      rollback(context)
      if (error instanceof ActionResultError && error.code === 'submission_required') {
        onSubmissionRequired()
      } else {
        toast.error(errorMessage(error))
      }
    },
    onSettled: settle,
  })

  const undo = useMutation({
    mutationFn: async () => unwrap(await undoCompletion({ lessonId })),
    onMutate: optimistic(false),
    onError: (error, _input, context) => {
      rollback(context)
      toast.error(errorMessage(error))
    },
    onSettled: settle,
  })

  const busy = complete.isPending || undo.isPending

  return (
    <BottomBar>
      <section aria-label={t('actions')} className="flex w-full items-center gap-3">
        {work.progress.done ? (
          <>
            <p className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-success">
              <Check className="size-5 shrink-0" aria-hidden />
              <span className="truncate">
                {work.progress.completedByName
                  ? t('markedDoneBy', { name: work.progress.completedByName })
                  : t('done')}
              </span>
            </p>
            <Button variant="outline" size="touch" disabled={busy} onClick={() => undo.mutate()}>
              {t('undo')}
            </Button>
            {work.nextLessonId &&
              // Until the completion is saved the next lesson may still be locked on the server, so
              // the link waits for it (the bar itself has already changed, SC-001).
              (busy ? (
                <Button size="touch" disabled>
                  {t('nextLesson')}
                  <ChevronRight aria-hidden />
                </Button>
              ) : (
                <Button asChild size="touch">
                  <Link href={`/s/lessons/${work.nextLessonId}`}>
                    {t('nextLesson')}
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              ))}
          </>
        ) : (
          <>
            <FocusButton lessonId={lessonId} timer={focus} />
            <Button size="xl" className="flex-1" disabled={busy} onClick={() => complete.mutate()}>
              <Check aria-hidden />
              {t('markComplete')}
            </Button>
          </>
        )}
      </section>
    </BottomBar>
  )
}
