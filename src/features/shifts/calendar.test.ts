// @vitest-environment node
// Spec 005 US1 scenario 3; research R5: shifts → chips per local date of the month calendar. An
// overnight shift is "22→" on its start date and "→07" on the next, joined (one record, two chips).
import { describe, expect, test } from 'vitest'
import { zonedToUtc } from '@/lib/time'
import { monthChips } from './calendar'
import type { ShiftView } from './types'

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'

let next = 0
function shift(
  type: ShiftView['type'],
  [startDate, startTime]: [string, string],
  [endDate, endTime]: [string, string],
): ShiftView {
  next += 1
  return {
    id: `s${next}`,
    type,
    startAt: zonedToUtc(startDate, startTime, TOKYO).toISOString(),
    endAt: zonedToUtc(endDate, endTime, TOKYO).toISOString(),
    sleepMinutes: 0,
    fromRotation: false,
    overridden: false,
  }
}

const labels = (chips: ReturnType<typeof monthChips>, date: string) =>
  (chips.get(date) ?? []).map((c) => [c.label, c.part])

describe('monthChips', () => {
  test('a same-day shift is one chip "9–18"', () => {
    const day = shift('day', ['2026-11-02', '09:00'], ['2026-11-02', '18:00'])
    const chips = monthChips([day], TOKYO, '2026-11')
    expect(labels(chips, '2026-11-02')).toEqual([['9–18', 'whole']])
    expect(chips.get('2026-11-02')?.[0].shift).toBe(day)
  })

  test('minutes show only when they are not :00', () => {
    const day = shift('custom', ['2026-11-02', '09:30'], ['2026-11-02', '13:45'])
    expect(labels(monthChips([day], TOKYO, '2026-11'), '2026-11-02')).toEqual([
      ['9:30–13:45', 'whole'],
    ])
  })

  test('an overnight shift is "22→" on its date and "→07" on the next, joined', () => {
    const night = shift('night', ['2026-11-20', '22:00'], ['2026-11-21', '07:00'])
    const chips = monthChips([night], TOKYO, '2026-11')
    expect(labels(chips, '2026-11-20')).toEqual([['22→', 'start']])
    expect(labels(chips, '2026-11-21')).toEqual([['→07', 'end']])
  })

  test('a Sunday night joins Monday across the row break', () => {
    const night = shift('night', ['2026-11-22', '22:00'], ['2026-11-23', '07:00'])
    const chips = monthChips([night], TOKYO, '2026-11')
    expect(labels(chips, '2026-11-22')).toEqual([['22→', 'start']])
    expect(labels(chips, '2026-11-23')).toEqual([['→07', 'end']])
  })

  test('only the dates inside the month get chips', () => {
    const fromOctober = shift('night', ['2026-10-31', '22:00'], ['2026-11-01', '07:00'])
    const intoDecember = shift('night', ['2026-11-30', '22:00'], ['2026-12-01', '07:00'])
    const chips = monthChips([fromOctober, intoDecember], TOKYO, '2026-11')
    expect(labels(chips, '2026-11-01')).toEqual([['→07', 'end']])
    expect(labels(chips, '2026-11-30')).toEqual([['22→', 'start']])
    expect([...chips.keys()].sort()).toEqual(['2026-11-01', '2026-11-30'])
  })

  test('a day with the end of one night and the start of the next lists the end first', () => {
    const first = shift('night', ['2026-11-06', '22:00'], ['2026-11-07', '07:00'])
    const second = shift('night', ['2026-11-07', '22:00'], ['2026-11-08', '07:00'])
    expect(labels(monthChips([second, first], TOKYO, '2026-11'), '2026-11-07')).toEqual([
      ['→07', 'end'],
      ['22→', 'start'],
    ])
  })

  test('a shift ending at midnight stays on its day as "14–24"', () => {
    const evening = shift('evening', ['2026-11-02', '14:00'], ['2026-11-03', '00:00'])
    const chips = monthChips([evening], TOKYO, '2026-11')
    expect(labels(chips, '2026-11-02')).toEqual([['14–24', 'whole']])
    expect(chips.has('2026-11-03')).toBe(false)
  })

  test('a 24 h shift starts on one day and ends on the next', () => {
    const long = shift('custom', ['2026-11-02', '08:00'], ['2026-11-03', '08:00'])
    const chips = monthChips([long], TOKYO, '2026-11')
    expect(labels(chips, '2026-11-02')).toEqual([['8→', 'start']])
    expect(labels(chips, '2026-11-03')).toEqual([['→08', 'end']])
  })

  test('an Off day is one chip with no times', () => {
    const off = shift('off', ['2026-11-05', '00:00'], ['2026-11-06', '00:00'])
    expect(labels(monthChips([off], TOKYO, '2026-11'), '2026-11-05')).toEqual([['', 'whole']])
  })

  test('seen from another zone, the chips move to that zone’s dates and times', () => {
    // Tokyo Fri 22:00 → Sat 07:00 is Yangon Fri 19:30 → Sat 04:30 (Tokyo is 2 h 30 ahead).
    const night = shift('night', ['2026-11-20', '22:00'], ['2026-11-21', '07:00'])
    const chips = monthChips([night], YANGON, '2026-11')
    expect(labels(chips, '2026-11-20')).toEqual([['19:30→', 'start']])
    expect(labels(chips, '2026-11-21')).toEqual([['→04:30', 'end']])
  })
})
