// Focus timer rules (spec 004 US4, FR-007; research.md R3). The database applies the same cap in SQL
// (COUNTED_SECONDS in repo.ts and the study_sessions_capped check); these are the client's copies for
// the countdown and the server's for the 60 s rule.

const MINUTE_MS = 60_000

/** FR-007: a session under a minute isn't study (a mis-tap), so it isn't kept. */
export const MIN_COUNTED_SECONDS = 60

type Session = { startedAt: Date; plannedMinutes: number }

const plannedEnd = ({ startedAt, plannedMinutes }: Session) =>
  startedAt.getTime() + plannedMinutes * MINUTE_MS

/** Whole seconds a session counts: real time from its start, never past its plan. */
export function countedSeconds(session: Session & { endedAt: Date | null }, now: Date) {
  const end = Math.min((session.endedAt ?? now).getTime(), plannedEnd(session))
  return Math.max(0, Math.floor((end - session.startedAt.getTime()) / 1000))
}

/** Server time minus this device's time, in ms, from a server timestamp read at `clientNow`. */
export const clockOffset = (serverNow: Date, clientNow: Date) =>
  serverNow.getTime() - clientNow.getTime()

/**
 * Seconds left on the countdown, rounded up so it shows 0:00 only at the end, and never more than the
 * plan (a timer started a moment ago from a stale tick). `offsetMs` corrects a phone clock that is
 * wrong, since `startedAt` is server time (research.md R3).
 */
export function remainingSeconds(session: Session, clientNow: Date, offsetMs: number) {
  const left = plannedEnd(session) - (clientNow.getTime() + offsetMs)
  return Math.min(session.plannedMinutes * 60, Math.max(0, Math.ceil(left / 1000)))
}

export const shouldDiscard = (seconds: number) => seconds < MIN_COUNTED_SECONDS

/** "14:59", "0:10". */
export function formatCountdown(seconds: number) {
  const s = seconds % 60
  return `${Math.floor(seconds / 60)}:${s.toString().padStart(2, '0')}`
}
