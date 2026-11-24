'use client'

import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { lessonKeys } from '@/features/courses/queries'
import type { StudentLesson } from '@/features/courses/types'
import { enqueue } from '@/lib/offline/outbox'
import type { Attachment, FocusMinutes } from './schemas'
import type { FocusSession } from './types'

// The progress changes a student can make offline (spec 008 FR-003, FR-003a, FR-003c; research R5,
// R7): complete/undo, a draft and Submit, and focus sessions. Each is queued under its record's key,
// so "Will sync" and coalescing find it (data-model.md outbox.recordKey).

export const progressKey = (lessonId: string) => `progress:${lessonId}`
export const submissionKey = (lessonId: string) => `submission:${lessonId}`

/** The id an answer written offline has on screen until it first syncs. */
export const PENDING_SUBMISSION_ID = 'pending'

/** The server's version of an answer, or null when the server has none yet (research R7). */
export function serverVersion(submission: { id: string; updatedAt: string } | null) {
  return submission && submission.id !== PENDING_SUBMISSION_ID ? submission.updatedAt : null
}

/** The lesson's title for the "Not saved" sheet, from the lesson already on screen. */
export function lessonLabel(queryClient: QueryClient, lessonId: string) {
  return queryClient.getQueryData<StudentLesson>(lessonKeys.student(lessonId))?.title ?? ''
}

export function queueCompletion({
  userId,
  lessonId,
  done,
  label,
}: {
  userId: string
  lessonId: string
  done: boolean
  label: string
}) {
  return enqueue({
    userId,
    type: done ? 'progress.complete' : 'progress.undo',
    recordKey: progressKey(lessonId),
    payload: { lessonId },
    // R7: what the student saw is the opposite of what they asked for.
    base: { wasDone: !done },
    label,
  })
}

export function queueAnswer({
  userId,
  lessonId,
  bodyMd,
  attachments,
  baseUpdatedAt,
  isSubmit,
  label,
}: {
  userId: string
  lessonId: string
  bodyMd: string
  attachments: Attachment[]
  /** The stored answer's updatedAt the student was editing, or null for a new one. */
  baseUpdatedAt: string | null
  isSubmit: boolean
  label: string
}) {
  return enqueue({
    userId,
    type: isSubmit ? 'submission.submit' : 'submission.save',
    recordKey: submissionKey(lessonId),
    payload: { lessonId, bodyMd, attachments },
    base: { updatedAt: baseUpdatedAt },
    label,
  })
}

// ── Focus sessions run offline ────────────────────────────────────────────────────────────────
// Kept in memory, not in the ['focus'] query: the query refetches on reconnect and would replace a
// timer still running with the server's "nothing running". It survives navigation, not a reload.

const LOCAL_PREFIX = 'local:'
let localSession: FocusSession | null = null
const listeners = new Set<() => void>()

export const isLocalSession = (sessionId: string) => sessionId.startsWith(LOCAL_PREFIX)

export function startLocalFocus(lessonId: string, minutes: FocusMinutes): FocusSession {
  localSession = {
    id: `${LOCAL_PREFIX}${crypto.randomUUID()}`,
    lessonId,
    lessonTitle: null,
    startedAt: new Date().toISOString(),
    plannedMinutes: minutes,
  }
  listeners.forEach((listener) => listener())
  return localSession
}

/** Ends the local session and queues it; returns the seconds it counted (capped at its plan). */
export async function stopLocalFocus({ userId, label }: { userId: string; label: string }) {
  const session = localSession
  if (!session?.lessonId) return 0
  localSession = null
  listeners.forEach((listener) => listener())
  const startedAt = new Date(session.startedAt)
  const cap = startedAt.getTime() + session.plannedMinutes * 60_000
  const endedAt = new Date(Math.min(Date.now(), cap))
  const op = crypto.randomUUID()
  await enqueue({
    userId,
    type: 'focus.record',
    recordKey: `focus:${op}`,
    payload: {
      lessonId: session.lessonId,
      minutes: session.plannedMinutes,
      startedAt: session.startedAt,
      endedAt: endedAt.toISOString(),
    },
    base: null,
    at: endedAt.toISOString(),
    label,
  })
  return Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
}

/** A session started online and stopped offline (R7 focus.stop). */
export function queueFocusStop({
  userId,
  sessionId,
  label,
}: {
  userId: string
  sessionId: string
  label: string
}) {
  return enqueue({
    userId,
    type: 'focus.stop',
    recordKey: `focus:${sessionId}`,
    payload: { sessionId },
    base: null,
    label,
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLocalFocus() {
  return useSyncExternalStore(
    subscribe,
    () => localSession,
    () => null,
  )
}
