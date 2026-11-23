// @vitest-environment node
// Spec 004 FR-006, FR-008, research.md R4: active days, the current and best streak, and the week's
// active days, over local calendar dates. The dates come from todayIn() in the student's zone, so
// the zone cases check that study either side of local midnight lands on two dates.
import { describe, expect, test } from 'vitest'
import { addCalendarDays, todayIn } from '@/lib/time'
import { bestStreak, currentStreak, isActiveDay, weekActiveDays } from './streak'

/** `n` consecutive dates ending on `last`. */
const run = (last: string, n: number) =>
  Array.from({ length: n }, (_, i) => addCalendarDays(last, i - n + 1))

describe('isActiveDay', () => {
  test('10 study minutes (600 s) make a day active; 599 s do not', () => {
    expect(isActiveDay({ seconds: 599, completions: 0 })).toBe(false)
    expect(isActiveDay({ seconds: 600, completions: 0 })).toBe(true)
  })

  test('one completion makes a day active without study time', () => {
    expect(isActiveDay({ seconds: 0, completions: 1 })).toBe(true)
  })
})

describe('currentStreak', () => {
  const today = '2026-11-22'

  test('the run ending today when today is active', () => {
    expect(currentStreak(run(today, 6), today)).toBe(6)
  })

  test('today not yet active: the run ending yesterday still counts', () => {
    expect(currentStreak(run('2026-11-21', 4), today)).toBe(4)
  })

  test('nothing yesterday or today → 0', () => {
    expect(currentStreak(run('2026-11-20', 5), today)).toBe(0)
  })

  test('a gap ends the run', () => {
    expect(currentStreak([...run('2026-11-15', 3), ...run(today, 2)], today)).toBe(2)
  })

  test('order and duplicates do not matter', () => {
    expect(currentStreak([today, '2026-11-21', today, '2026-11-20'].reverse(), today)).toBe(3)
  })
})

describe('bestStreak', () => {
  test('the longest run ever', () => {
    expect(bestStreak([...run('2026-10-20', 9), ...run('2026-11-22', 6)])).toBe(9)
  })

  test('no active days → 0', () => {
    expect(bestStreak([])).toBe(0)
  })

  test('runs across month and year ends', () => {
    expect(bestStreak(run('2027-01-02', 5))).toBe(5)
  })
})

describe('weekActiveDays', () => {
  test('counts active days Monday to Sunday only, and may pass the goal', () => {
    const monday = '2026-11-16'
    const dates = ['2026-11-15', ...run('2026-11-22', 7), '2026-11-23']
    expect(weekActiveDays(dates, monday)).toBe(7)
    expect(weekActiveDays(['2026-11-17', '2026-11-19'], monday)).toBe(2)
  })
})

describe('local dates by time zone', () => {
  test.each([
    ['Asia/Tokyo', '2026-11-20T14:30:00Z', '2026-11-20T15:30:00Z'], // 23:30 and 00:30 JST
    ['Asia/Yangon', '2026-11-20T17:00:00Z', '2026-11-20T18:00:00Z'], // 23:30 and 00:30 MMT (+06:30)
    ['America/New_York', '2026-11-21T04:30:00Z', '2026-11-21T05:30:00Z'], // 23:30 and 00:30 EST
  ])('%s: study either side of midnight falls on two dates, one streak', (zone, before, after) => {
    const dates = [todayIn(zone, new Date(before)), todayIn(zone, new Date(after))]
    expect(dates[1]).toBe(addCalendarDays(dates[0], 1))
    expect(currentStreak(dates, dates[1])).toBe(2)
  })

  test('America/New_York: the daylight-saving week (1 Nov 2026) is seven dates', () => {
    // A study session at 20:00 local each evening, 30 Oct – 5 Nov; the clocks fall back on 1 Nov.
    const instants = [
      '2026-10-31T00:00:00Z', // Fri 30 Oct 20:00 EDT
      '2026-11-01T00:00:00Z', // Sat 31 Oct 20:00 EDT
      '2026-11-02T01:00:00Z', // Sun 1 Nov 20:00 EST
      '2026-11-03T01:00:00Z',
      '2026-11-04T01:00:00Z',
      '2026-11-05T01:00:00Z',
      '2026-11-06T01:00:00Z', // Thu 5 Nov 20:00 EST
    ]
    const dates = instants.map((at) => todayIn('America/New_York', new Date(at)))
    expect(dates).toEqual(run('2026-11-05', 7))
    expect(currentStreak(dates, '2026-11-05')).toBe(7)
    expect(weekActiveDays(dates, '2026-11-02')).toBe(4)
  })
})
