// @vitest-environment node
// Spec 005 FR-009; research R9: "Next week's shifts — correct?" from Sunday 18:00 in the student's
// time until the week starts, unless they answered for that week (data-model.md
// Profile.shifts_confirmed_week) or have no shifts at all.
import { describe, expect, test } from 'vitest'
import { zonedToUtc } from '@/lib/time'
import { weekCheck } from './week-check'

const TOKYO = 'Asia/Tokyo'
const NY = 'America/New_York'
// Sun 29 Nov 2026; the coming week starts Mon 30 Nov.
const sunday = (time: string, zone = TOKYO) => zonedToUtc('2026-11-29', time, zone)
const base = { timeZone: TOKYO, confirmedWeek: null, hasShifts: true }

describe('weekCheck', () => {
  test('not due before Sunday 18:00', () => {
    expect(weekCheck({ ...base, now: sunday('17:59') })).toEqual({ due: false, week: '2026-11-30' })
    expect(weekCheck({ ...base, now: zonedToUtc('2026-11-27', '20:00', TOKYO) }).due).toBe(false)
  })

  test('due from Sunday 18:00 until the week starts', () => {
    expect(weekCheck({ ...base, now: sunday('18:00') })).toEqual({ due: true, week: '2026-11-30' })
    expect(weekCheck({ ...base, now: sunday('23:59') }).due).toBe(true)
    const monday = weekCheck({ ...base, now: zonedToUtc('2026-11-30', '00:00', TOKYO) })
    expect(monday).toEqual({ due: false, week: '2026-12-07' })
  })

  test('not due once the coming week is confirmed', () => {
    const now = sunday('19:00')
    expect(weekCheck({ ...base, now, confirmedWeek: '2026-11-30' }).due).toBe(false)
    // An answer for an earlier week doesn't count.
    expect(weekCheck({ ...base, now, confirmedWeek: '2026-11-23' }).due).toBe(true)
  })

  test('never due without any shift (FR-009)', () => {
    expect(weekCheck({ ...base, now: sunday('19:00'), hasShifts: false }).due).toBe(false)
  })

  test('judged by the student’s own clock (New York)', () => {
    const nyBase = { ...base, timeZone: NY }
    expect(weekCheck({ ...nyBase, now: sunday('17:30', NY) }).due).toBe(false)
    expect(weekCheck({ ...nyBase, now: sunday('18:30', NY) }).due).toBe(true)
    // 18:30 in New York is already Monday in Tokyo.
    expect(weekCheck({ ...base, now: sunday('18:30', NY) })).toEqual({
      due: false,
      week: '2026-12-07',
    })
  })
})
