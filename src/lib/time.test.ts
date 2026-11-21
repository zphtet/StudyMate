// @vitest-environment node
// Constitution IV: dates are judged in the viewer's own time zone (spec 002 "on date" unlock rule).
import { describe, expect, test } from 'vitest'
import { todayIn } from './time'

describe('todayIn', () => {
  // 2026-11-21 17:45 UTC
  const now = new Date(Date.UTC(2026, 10, 21, 17, 45))

  test.each([
    ['UTC', '2026-11-21'],
    ['Asia/Yangon', '2026-11-22'], // +06:30 → 00:15 next day
    ['Asia/Tokyo', '2026-11-22'], // +09:00 → 02:45 next day
    ['America/Los_Angeles', '2026-11-21'], // −08:00 → 09:45
  ])('%s → %s', (zone, expected) => {
    expect(todayIn(zone, now)).toBe(expected)
  })

  test('just before midnight in Yangon is still the same day there', () => {
    expect(todayIn('Asia/Yangon', new Date(Date.UTC(2026, 10, 21, 17, 29)))).toBe('2026-11-21')
  })

  test('defaults to the current time', () => {
    expect(todayIn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
