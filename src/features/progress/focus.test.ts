// @vitest-environment node
// Spec 004 US4, FR-007; research.md R3; data-model.md StudySession.planned_minutes,
// StudySession.ended_at: a focus session counts real time from its start, capped at its plan, and a
// session under a minute isn't counted.
import { describe, expect, test } from 'vitest'
import {
  clockOffset,
  countedSeconds,
  formatCountdown,
  remainingSeconds,
  shouldDiscard,
} from './focus'

const start = new Date('2026-11-22T10:00:00Z')
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000)

describe('countedSeconds', () => {
  test('an open session counts the time so far', () => {
    expect(countedSeconds({ startedAt: start, endedAt: null, plannedMinutes: 15 }, at(125))).toBe(
      125,
    )
  })

  test('an open session left for hours counts exactly its plan (US4 scenario 2)', () => {
    expect(
      countedSeconds({ startedAt: start, endedAt: null, plannedMinutes: 15 }, at(3 * 3600)),
    ).toBe(15 * 60)
  })

  test('a stopped session counts up to its end, whatever the time now', () => {
    expect(
      countedSeconds({ startedAt: start, endedAt: at(600), plannedMinutes: 25 }, at(5000)),
    ).toBe(600)
  })

  test('an end past the plan is still capped', () => {
    expect(
      countedSeconds({ startedAt: start, endedAt: at(2000), plannedMinutes: 25 }, at(2000)),
    ).toBe(25 * 60)
  })

  test('whole seconds, never negative', () => {
    expect(countedSeconds({ startedAt: start, endedAt: null, plannedMinutes: 15 }, at(9.7))).toBe(9)
    expect(countedSeconds({ startedAt: start, endedAt: null, plannedMinutes: 15 }, at(-5))).toBe(0)
  })
})

describe('remainingSeconds', () => {
  const session = { startedAt: start, plannedMinutes: 15 as const }

  test('counts down from the plan', () => {
    expect(remainingSeconds(session, at(0), 0)).toBe(900)
    expect(remainingSeconds(session, at(890), 0)).toBe(10)
    expect(remainingSeconds(session, at(899.2), 0)).toBe(1)
  })

  test('never more than the plan, even from a device clock a moment behind', () => {
    expect(remainingSeconds(session, at(-3), 0)).toBe(900)
  })

  test('stops at zero', () => {
    expect(remainingSeconds(session, at(900), 0)).toBe(0)
    expect(remainingSeconds(session, at(5000), 0)).toBe(0)
  })

  test('uses the server clock: a phone 2 min fast still sees the full time', () => {
    const phoneNow = at(120)
    const offset = clockOffset(start, phoneNow) // server − phone
    expect(offset).toBe(-120_000)
    expect(remainingSeconds(session, phoneNow, offset)).toBe(900)
  })
})

describe('shouldDiscard', () => {
  test.each([
    [0, true],
    [59, true],
    [60, false],
    [900, false],
  ])('%i s → %s', (seconds, discard) => {
    expect(shouldDiscard(seconds)).toBe(discard)
  })
})

describe('formatCountdown', () => {
  test.each([
    [1500, '25:00'],
    [899, '14:59'],
    [10, '0:10'],
    [0, '0:00'],
  ])('%i s → %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text)
  })
})
