// Pure rules for email codes (spec 001 FR-011; specs/001-auth-roles-linking/data-model.md › AuthEmailLimit).
// No I/O here: limits-repo.ts loads and saves the row, the auth actions apply these decisions.

export const COOLDOWN_SECONDS = 60
export const MAX_SENDS_PER_WINDOW = 5
export const WINDOW_SECONDS = 60 * 60
export const MAX_FAILED_ATTEMPTS = 5

export type LimitPurpose = 'signup' | 'recovery'

export type LimitRow = {
  windowStartedAt: Date
  sendsInWindow: number
  lastSentAt: Date | null
  failedAttempts: number
}

export type SendDecision =
  | { ok: true; next: LimitRow }
  | { ok: false; error: 'cooldown'; seconds: number }
  | { ok: false; error: 'too_many_sends'; minutes: number }

const secondsBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 1000

/** May a code be sent now? If so, the row to store after sending. */
export function decideSend(row: LimitRow | null, now: Date): SendDecision {
  if (row?.lastSentAt) {
    const since = secondsBetween(row.lastSentAt, now)
    if (since < COOLDOWN_SECONDS) {
      return { ok: false, error: 'cooldown', seconds: Math.ceil(COOLDOWN_SECONDS - since) }
    }
  }

  const windowOpen = row !== null && secondsBetween(row.windowStartedAt, now) < WINDOW_SECONDS
  if (windowOpen && row.sendsInWindow >= MAX_SENDS_PER_WINDOW) {
    const left = WINDOW_SECONDS - secondsBetween(row.windowStartedAt, now)
    return { ok: false, error: 'too_many_sends', minutes: Math.ceil(left / 60) }
  }

  return {
    ok: true,
    next: {
      windowStartedAt: windowOpen ? row.windowStartedAt : now,
      sendsInWindow: windowOpen ? row.sendsInWindow + 1 : 1,
      lastSentAt: now,
      failedAttempts: 0,
    },
  }
}

/** May the user try a code now? After 5 wrong codes they must request a new one. */
export function checkVerify(
  row: LimitRow | null,
): { ok: true } | { ok: false; error: 'too_many_attempts' } {
  if (row && row.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { ok: false, error: 'too_many_attempts' }
  }
  return { ok: true }
}

/** Count a wrong code. A successful verify deletes the row instead (limits-repo.ts). */
export function recordFailedAttempt(
  row: LimitRow | null,
  now: Date,
): { next: LimitRow; attemptsLeft: number } {
  const base = row ?? {
    windowStartedAt: now,
    sendsInWindow: 0,
    lastSentAt: null,
    failedAttempts: 0,
  }
  const failedAttempts = base.failedAttempts + 1
  return {
    next: { ...base, failedAttempts },
    attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - failedAttempts),
  }
}
