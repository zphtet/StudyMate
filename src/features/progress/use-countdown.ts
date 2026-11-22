'use client'

import { useEffect, useRef, useState } from 'react'
import { remainingSeconds } from './focus'
import type { FocusSession } from './types'

/**
 * Seconds left on a running focus session, ticking once a second (research.md R3). `offsetMs` is the
 * server clock minus this device's, since `startedAt` is server time. Calls `onEnd` once per session
 * when it reaches 0. Null when nothing runs.
 */
export function useCountdown(
  session: Pick<FocusSession, 'id' | 'startedAt' | 'plannedMinutes'> | null,
  offsetMs: number,
  onEnd: (sessionId: string) => void,
) {
  const [now, setNow] = useState(() => new Date())
  const isRunning = session !== null
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [isRunning])

  const remaining =
    session &&
    remainingSeconds(
      { startedAt: new Date(session.startedAt), plannedMinutes: session.plannedMinutes },
      now,
      offsetMs,
    )

  const onEndRef = useRef(onEnd)
  const endedId = useRef<string | null>(null)
  useEffect(() => {
    onEndRef.current = onEnd
  })
  const sessionId = session?.id ?? null
  useEffect(() => {
    // Once per session: re-renders at 0 (and Strict Mode's second effect run) don't stop it twice.
    if (remaining !== 0 || !sessionId || endedId.current === sessionId) return
    endedId.current = sessionId
    onEndRef.current(sessionId)
  }, [remaining, sessionId])

  return remaining
}
