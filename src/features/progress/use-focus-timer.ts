'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { startFocus, stopFocus } from './actions'
import { focusKeys, focusQuery, lessonWorkKeys, progressKeys, type FocusData } from './queries'
import type { FocusMinutes } from './schemas'
import { useCountdown } from './use-countdown'

// The focus timer on the lesson screen (spec 004 US4; research.md R3, R14). The running session is
// server state in ['focus']: Start and Stop change it at once and roll back on error, then Progress
// and the lesson's work refetch (contracts/server-actions.md › Query invalidation). The countdown
// runs whatever the bar shows, so a timer reaching 0 stops itself even after Mark complete.

/** The id of a session the server hasn't answered for yet; it can't be stopped. */
export const PENDING_SESSION = 'pending'

export function useFocusTimer(lessonId: string) {
  const t = useTranslations('lessonWork.focus')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const { data } = useQuery(focusQuery)
  const session = data?.session ?? null

  const replace = async (next: (old: FocusData) => FocusData) => {
    await queryClient.cancelQueries({ queryKey: focusKeys.active })
    const snapshot = queryClient.getQueryData<FocusData>(focusKeys.active)
    if (snapshot) queryClient.setQueryData(focusKeys.active, next(snapshot))
    return { snapshot }
  }
  const rollback = (
    error: Error,
    _input: unknown,
    context: { snapshot?: FocusData } | undefined,
  ) => {
    if (context?.snapshot) queryClient.setQueryData(focusKeys.active, context.snapshot)
    toast.error(errorMessage(error))
  }
  const settle = (studiedLessonId: string | null) =>
    Promise.all(
      [
        focusKeys.active,
        progressKeys.all,
        ...(studiedLessonId ? [lessonWorkKeys.work(studiedLessonId)] : []),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )

  const start = useMutation({
    mutationFn: async (minutes: FocusMinutes) => unwrap(await startFocus({ lessonId, minutes })),
    onMutate: (minutes) =>
      replace((old) => ({
        ...old,
        // Server time as this device estimates it; corrected by the answer (research.md R14).
        session: {
          id: PENDING_SESSION,
          lessonId,
          lessonTitle: null,
          startedAt: new Date(Date.now() + old.offsetMs).toISOString(),
          plannedMinutes: minutes,
        },
      })),
    onSuccess: ({ sessionId, startedAt }) =>
      queryClient.setQueryData<FocusData>(focusKeys.active, (old) =>
        old?.session ? { ...old, session: { ...old.session, id: sessionId, startedAt } } : old,
      ),
    onError: rollback,
    onSettled: () => settle(lessonId),
  })

  const stop = useMutation({
    mutationFn: async (input: {
      sessionId: string
      lessonId: string | null
      isFinished: boolean
    }) => unwrap(await stopFocus({ sessionId: input.sessionId })),
    onMutate: () => replace((old) => ({ ...old, session: null })),
    onSuccess: ({ countedSeconds }, { isFinished }) => {
      if (!isFinished) return
      toast.success(t('finished', { minutes: Math.floor(countedSeconds / 60) }))
      vibrate()
    },
    onError: rollback,
    onSettled: (_result, _error, input) => settle(input.lessonId),
  })

  const remaining = useCountdown(session, data?.offsetMs ?? 0, (sessionId) => {
    if (sessionId !== PENDING_SESSION) {
      stop.mutate({ sessionId, lessonId: session?.lessonId ?? null, isFinished: true })
    }
  })

  return {
    /** False until the first answer: the button waits so it never offers Start over a running timer. */
    isReady: data !== undefined,
    session,
    remaining,
    isBusy: start.isPending || stop.isPending || session?.id === PENDING_SESSION,
    start: (minutes: FocusMinutes) => start.mutate(minutes),
    stop: () => {
      if (session && session.id !== PENDING_SESSION) {
        stop.mutate({ sessionId: session.id, lessonId: session.lessonId, isFinished: false })
      }
    },
  }
}

export type FocusTimer = ReturnType<typeof useFocusTimer>

/** "Focus done": a short buzz where the device has one, unless the user asked for less motion. */
function vibrate() {
  if (typeof navigator.vibrate !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  navigator.vibrate(200)
}
