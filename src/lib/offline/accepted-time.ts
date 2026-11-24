// Which device time the server keeps for a queued change (spec 008 FR-003c; research R8). The time
// the student acted is kept for user-facing instants (completed_at, submitted_at, a focus session),
// so streaks, daily counts and on-time-or-late stay true to what happened offline. It is bounded so
// a wrong or changed device clock can't backdate work. Versions (updated_at) are always server time.

/** Longer than any realistic offline stretch, shorter than any course. */
export const MAX_OFFLINE_AGE_MS = 14 * 24 * 60 * 60 * 1000
/** A device clock this far ahead counts as now. */
export const MAX_SKEW_MS = 2 * 60 * 1000

export function acceptedTime({
  at,
  serverNow,
  base,
}: {
  /** When the student acted, as the device reported it (ISO). */
  at: string
  serverNow: Date
  /** The server version the change was made on, if any. */
  base: Date | null
}): Date {
  const time = new Date(at).getTime()
  const now = serverNow.getTime()
  const isReadable = Number.isFinite(time)
  const isTooNew = time > now + MAX_SKEW_MS
  const isTooOld = time < now - MAX_OFFLINE_AGE_MS
  const isBeforeBase = base !== null && time < base.getTime()
  if (!isReadable || isTooNew || isTooOld || isBeforeBase) return serverNow
  return time > now ? serverNow : new Date(time)
}
