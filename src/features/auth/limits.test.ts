import { describe, expect, test } from 'vitest'
import {
  COOLDOWN_SECONDS,
  MAX_FAILED_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  checkVerify,
  decideSend,
  recordFailedAttempt,
  type LimitRow,
} from './limits'

// Rules table: specs/001-auth-roles-linking/data-model.md › AuthEmailLimit (spec FR-011).
const now = new Date('2026-11-20T10:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)
const row = (over: Partial<LimitRow> = {}): LimitRow => ({
  windowStartedAt: ago(600),
  sendsInWindow: 1,
  lastSentAt: ago(600),
  failedAttempts: 0,
  ...over,
})

describe('decideSend', () => {
  test('first send for an email starts a window', () => {
    expect(decideSend(null, now)).toEqual({
      ok: true,
      next: { windowStartedAt: now, sendsInWindow: 1, lastSentAt: now, failedAttempts: 0 },
    })
  })

  test('refuses within 60 s of the last send and says how long to wait', () => {
    expect(COOLDOWN_SECONDS).toBe(60)
    expect(decideSend(row({ lastSentAt: ago(15) }), now)).toEqual({
      ok: false,
      error: 'cooldown',
      seconds: 45,
    })
    expect(decideSend(row({ lastSentAt: ago(59.5) }), now)).toEqual({
      ok: false,
      error: 'cooldown',
      seconds: 1,
    })
  })

  test('allows a send exactly 60 s later and counts it in the window', () => {
    const result = decideSend(row({ lastSentAt: ago(60), sendsInWindow: 2 }), now)
    expect(result).toMatchObject({ ok: true, next: { sendsInWindow: 3, lastSentAt: now } })
  })

  test('refuses the 6th send in an hour and says how many minutes are left', () => {
    expect(MAX_SENDS_PER_WINDOW).toBe(5)
    const full = row({ windowStartedAt: ago(20 * 60), sendsInWindow: 5, lastSentAt: ago(120) })
    expect(decideSend(full, now)).toEqual({ ok: false, error: 'too_many_sends', minutes: 40 })
  })

  test('restarts the window once an hour has passed', () => {
    const old = row({ windowStartedAt: ago(3600), sendsInWindow: 5, lastSentAt: ago(1800) })
    expect(decideSend(old, now)).toEqual({
      ok: true,
      next: { windowStartedAt: now, sendsInWindow: 1, lastSentAt: now, failedAttempts: 0 },
    })
  })

  test('a send resets the failed attempts (a new code gets 5 tries)', () => {
    const result = decideSend(row({ failedAttempts: 5 }), now)
    expect(result).toMatchObject({ ok: true, next: { failedAttempts: 0 } })
  })
})

describe('verify attempts', () => {
  test('allows verifying with no row or fewer than 5 failures', () => {
    expect(checkVerify(null)).toEqual({ ok: true })
    expect(checkVerify(row({ failedAttempts: 4 }))).toEqual({ ok: true })
  })

  test('refuses after 5 failed attempts until a new code is sent', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5)
    expect(checkVerify(row({ failedAttempts: 5 }))).toEqual({
      ok: false,
      error: 'too_many_attempts',
    })
  })

  test('a failed attempt is counted and reports attempts left', () => {
    expect(recordFailedAttempt(row({ failedAttempts: 1 }), now)).toEqual({
      next: { ...row({ failedAttempts: 2 }) },
      attemptsLeft: 3,
    })
  })

  test('a failed attempt without a row starts one', () => {
    expect(recordFailedAttempt(null, now)).toEqual({
      next: { windowStartedAt: now, sendsInWindow: 0, lastSentAt: null, failedAttempts: 1 },
      attemptsLeft: 4,
    })
  })

  test('the 5th failure leaves no attempts', () => {
    expect(recordFailedAttempt(row({ failedAttempts: 4 }), now).attemptsLeft).toBe(0)
  })
})
