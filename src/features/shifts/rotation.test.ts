// @vitest-environment node
// Spec 005 US2; research R4: a rotation's days. Local date start_date + i gets letter
// sequence[i mod length] (data-model.md ShiftPattern.sequence, ShiftPattern.start_date); D, E, N take
// the student's preset times (Profile.shift_presets), Night blocks sleep, O is a day without a shift.
import { describe, expect, test } from 'vitest'
import { zonedToUtc } from '@/lib/time'
import { rotationDays } from './rotation'

const TOKYO = 'Asia/Tokyo'
const NY = 'America/New_York'
const presets = {
  D: ['09:00', '18:00'] as [string, string],
  E: ['14:00', '23:00'] as [string, string],
  N: ['22:00', '07:00'] as [string, string],
}

const letters = (days: ReturnType<typeof rotationDays>) => days.map((d) => d.letter).join('')

describe('rotationDays', () => {
  test('letters follow the day offset from the start date, wrapping around', () => {
    const days = rotationDays(
      { sequence: 'DDDONNOO', startDate: '2026-11-30' },
      presets,
      TOKYO,
      '2026-11-30',
      '2026-12-09',
    )
    expect(days.map((d) => d.date)).toHaveLength(10)
    expect(letters(days)).toBe('DDDONNOODD')
  })

  test('D, E and N take the preset times; Night ends the next morning and blocks sleep', () => {
    const [day, evening, night] = rotationDays(
      { sequence: 'DEN', startDate: '2026-11-30' },
      presets,
      TOKYO,
      '2026-11-30',
      '2026-12-02',
    )
    expect(day.shift).toEqual({
      type: 'day',
      start: zonedToUtc('2026-11-30', '09:00', TOKYO),
      end: zonedToUtc('2026-11-30', '18:00', TOKYO),
      blockSleep: false,
    })
    expect(evening.shift).toMatchObject({ type: 'evening', blockSleep: false })
    expect(night.shift).toEqual({
      type: 'night',
      start: zonedToUtc('2026-12-02', '22:00', TOKYO),
      end: zonedToUtc('2026-12-03', '07:00', TOKYO),
      blockSleep: true,
    })
  })

  test('an O day has no shift', () => {
    const [off] = rotationDays(
      { sequence: 'OD', startDate: '2026-11-30' },
      presets,
      TOKYO,
      '2026-11-30',
      '2026-11-30',
    )
    expect(off).toEqual({ date: '2026-11-30', letter: 'O', shift: null })
  })

  test('a start date in the past continues the cycle where it is today', () => {
    // 2026-11-01 + 22 days: 22 mod 8 = 6 → the 7th letter (O), then O, D, D, D.
    const days = rotationDays(
      { sequence: 'DDDONNOO', startDate: '2026-11-01' },
      presets,
      TOKYO,
      '2026-11-23',
      '2026-11-27',
    )
    expect(letters(days)).toBe('OODDD')
  })

  test('days before the start date are not part of the rotation', () => {
    const days = rotationDays(
      { sequence: 'D', startDate: '2026-12-03' },
      presets,
      TOKYO,
      '2026-12-01',
      '2026-12-04',
    )
    expect(days.map((d) => d.date)).toEqual(['2026-12-03', '2026-12-04'])
  })

  test('times stay on the local clock across a daylight-saving change (New York)', () => {
    const days = rotationDays(
      { sequence: 'N', startDate: '2026-10-30' },
      presets,
      NY,
      '2026-10-30',
      '2026-11-02',
    )
    expect(days.map((d) => d.shift?.start.toISOString())).toEqual([
      '2026-10-31T02:00:00.000Z', // Fri 22:00 EDT
      '2026-11-01T02:00:00.000Z', // Sat 22:00 EDT
      '2026-11-02T03:00:00.000Z', // Sun 22:00 EST
      '2026-11-03T03:00:00.000Z',
    ])
    // Sat 22:00 → Sun 07:00 crosses the fall-back hour: 10 h.
    const saturday = days[1].shift!
    expect(saturday.end.getTime() - saturday.start.getTime()).toBe(10 * 3_600_000)
  })

  test('a 28-letter rotation repeats after 28 days', () => {
    const sequence = 'DDDDDOONNNNNOOEEEEEOODDDDDOO'
    expect(sequence).toHaveLength(28)
    const days = rotationDays(
      { sequence, startDate: '2026-11-30' },
      presets,
      TOKYO,
      '2026-11-30',
      '2027-01-24',
    )
    expect(letters(days)).toBe(sequence + sequence)
  })
})
