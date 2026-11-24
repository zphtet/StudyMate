'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { unwrap } from '@/lib/result'
import { runOrQueue } from '@/lib/offline/run-or-queue'
import { useErrorMessage } from '@/lib/use-error-message'
import { startFocus, stopFocus } from './actions'
import {
  isLocalSession,
  lessonLabel,
  queueFocusStop,
  startLocalFocus,
  stopLocalFocus,
  useLocalFocus,
} from './offline'
import { focusKeys, focusQuery, lessonWorkKeys, progressKeys, type FocusData } from './queries'
import type { FocusMinutes } from './schemas'
import { useCountdown } from './use-countdown'

// The focus timer on the lesson screen (spec 004 US4; research.md R3, R14). The running session is
// server state in ['focus']: Start and Stop change it at once and roll back on error, then Progress
// and the lesson's work refetch (contracts/server-actions.md › Query invalidation). The countdown
// runs whatever the bar shows, so a timer reaching 0 stops itself even after Mark complete.

/** The id of a session the server hasn't answered for yet; it can't be stopped. */
export const PENDING_SESSION = 'pending'

export function useFocusTimer(lessonId: string, studentId: string) {
  const t = useTranslations('lessonWork.focus')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const { data } = useQuery(focusQuery)
  // Spec 008: a session started offline runs on this device's clock until it is queued.
  const localSession = useLocalFocus()
  const session = localSession ?? data?.session ?? null

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
    networkMode: 'always',
    mutationFn: async (minutes: FocusMinutes) => {
      // Offline (spec 008 FR-003), the timer runs here and is recorded when it stops.
      if (!navigator.onLine) {
        const local = startLocalFocus(lessonId, minutes)
        return { sessionId: local.id, startedAt: local.startedAt }
      }
      return unwrap(await startFocus({ lessonId, minutes }))
    },
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
        // A local session lives in its own store; the query keeps the server's (none).
        isLocalSession(sessionId)
          ? old && { ...old, session: null }
          : old?.session
            ? { ...old, session: { ...old.session, id: sessionId, startedAt } }
            : old,
      ),
    onError: rollback,
    onSettled: (result) => {
      if (result && !isLocalSession(result.sessionId)) void settle(lessonId)
    },
  })

  const stop = useMutation({
    mutationFn: async (input: {
      sessionId: string
      lessonId: string | null
      plannedMinutes: number
      isFinished: boolean
    }) => {
      const label = lessonLabel(queryClient, input.lessonId ?? lessonId)
      if (isLocalSession(input.sessionId)) {
        return { countedSeconds: await stopLocalFocus({ userId: studentId, label }) }
      }
      const result = await runOrQueue({
        online: async () => unwrap(await stopFocus({ sessionId: input.sessionId })),
        queue: () => queueFocusStop({ userId: studentId, sessionId: input.sessionId, label }),
      })
      // Queued: the server counts it on sync. A timer that ran out counted its whole plan.
      if (!result.isQueued) return result.data
      return { countedSeconds: input.isFinished ? input.plannedMinutes * 60 : 0 }
    },
    networkMode: 'always',
    onMutate: () => replace((old) => ({ ...old, session: null })),
    onSuccess: ({ countedSeconds }, { isFinished }) => {
      if (!isFinished) return
      toast.success(t('finished', { minutes: Math.floor(countedSeconds / 60) }))
      vibrate()
    },
    onError: rollback,
    onSettled: (_result, _error, input) => settle(input.lessonId),
  })

  // A local session's start is this device's time, so no server offset applies.
  const offsetMs = localSession ? 0 : (data?.offsetMs ?? 0)
  const remaining = useCountdown(session, offsetMs, (sessionId) => {
    if (sessionId !== PENDING_SESSION) {
      stop.mutate({
        sessionId,
        lessonId: session?.lessonId ?? null,
        plannedMinutes: session?.plannedMinutes ?? 0,
        isFinished: true,
      })
    }
  })

  return {
    /** False until the first answer: the button waits so it never offers Start over a running timer. */
    isReady: data !== undefined || localSession !== null,
    session,
    remaining,
    isBusy: start.isPending || stop.isPending || session?.id === PENDING_SESSION,
    start: (minutes: FocusMinutes) => start.mutate(minutes),
    stop: () => {
      if (session && session.id !== PENDING_SESSION) {
        stop.mutate({
          sessionId: session.id,
          lessonId: session.lessonId,
          plannedMinutes: session.plannedMinutes,
          isFinished: false,
        })
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
