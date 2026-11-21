// @vitest-environment node
// Constitution IV: dates are judged in the viewer's own time zone (spec 002 "on date" unlock rule;
// spec 003 research.md R3: deadlines entered in the student's zone, days late by their calendar).
import { describe, expect, test } from 'vitest'
import {
  addCalendarDays,
  calendarDaysBetween,
  cityOf,
  localDayRange,
  mondayOf,
  moveToDay,
  roundUpToLocalHour,
  startOfLocalDay,
  todayIn,
  utcToZoned,
  zonedToUtc,
} from './time'

const NY = 'America/New_York'
const iso = (date: Date) => date.toISOString()

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

describe('zonedToUtc', () => {
  test.each([
    ['Asia/Tokyo', '2026-12-01T05:30:00.000Z'],
    ['Asia/Yangon', '2026-12-01T08:00:00.000Z'],
    ['UTC', '2026-12-01T14:30:00.000Z'],
    [NY, '2026-12-01T19:30:00.000Z'],
  ])('14:30 local on 1 Dec in %s', (zone, expected) => {
    expect(iso(zonedToUtc('2026-12-01', '14:30', zone))).toBe(expected)
  })

  test('a date without a time is due at 23:59 local (spec Edge Cases)', () => {
    expect(iso(zonedToUtc('2026-12-31', null, 'Asia/Tokyo'))).toBe('2026-12-31T14:59:00.000Z')
    expect(iso(zonedToUtc('2026-12-31', null, 'Asia/Yangon'))).toBe('2026-12-31T17:29:00.000Z')
  })

  test('a time inside the spring-forward gap moves forward to a valid time', () => {
    // 8 Mar 2026: New York clocks jump from 02:00 to 03:00, so 02:30 doesn't exist.
    const at = zonedToUtc('2026-03-08', '02:30', NY)
    expect(iso(at)).toBe('2026-03-08T07:30:00.000Z') // 03:30 EDT
    expect(utcToZoned(at, NY)).toEqual({ date: '2026-03-08', time: '03:30' })
  })
})

describe('utcToZoned', () => {
  test.each(['Asia/Tokyo', 'Asia/Yangon', 'UTC', NY])(
    'round-trips with zonedToUtc in %s',
    (zone) => {
      const fields = { date: '2026-11-03', time: '00:15' }
      expect(utcToZoned(zonedToUtc(fields.date, fields.time, zone), zone)).toEqual(fields)
    },
  )

  test('accepts ISO strings', () => {
    expect(utcToZoned('2026-11-20T15:00:00Z', 'Asia/Tokyo')).toEqual({
      date: '2026-11-21',
      time: '00:00',
    })
  })
})

describe('calendarDaysBetween', () => {
  test('23:59 and 00:01 the next local day are 1 day apart', () => {
    const due = zonedToUtc('2026-11-18', '23:59', 'Asia/Yangon')
    const now = zonedToUtc('2026-11-19', '00:01', 'Asia/Yangon')
    expect(calendarDaysBetween(due, now, 'Asia/Yangon')).toBe(1)
  })

  test('earlier the same local day is 0', () => {
    const due = zonedToUtc('2026-11-19', '08:00', 'Asia/Tokyo')
    const now = zonedToUtc('2026-11-19', '23:00', 'Asia/Tokyo')
    expect(calendarDaysBetween(due, now, 'Asia/Tokyo')).toBe(0)
  })

  test('the same two instants can be 0 days in one zone and 1 in another', () => {
    const due = new Date('2026-11-19T14:00:00Z') // 23:00 Tokyo, 20:30 Yangon
    const now = new Date('2026-11-19T16:00:00Z') // 01:00 Tokyo (next day), 22:30 Yangon
    expect(calendarDaysBetween(due, now, 'Asia/Tokyo')).toBe(1)
    expect(calendarDaysBetween(due, now, 'Asia/Yangon')).toBe(0)
  })

  test('counts calendar days across a DST change', () => {
    const due = zonedToUtc('2026-03-07', '12:00', NY)
    const now = zonedToUtc('2026-03-09', '00:30', NY)
    expect(calendarDaysBetween(due, now, NY)).toBe(2)
  })

  test('UTC', () => {
    expect(
      calendarDaysBetween(
        new Date('2026-11-01T23:00:00Z'),
        new Date('2026-11-04T01:00:00Z'),
        'UTC',
      ),
    ).toBe(3)
  })
})

describe('moveToDay', () => {
  test('keeps the local clock time on another day', () => {
    const due = zonedToUtc('2026-11-20', '21:00', 'Asia/Tokyo')
    expect(utcToZoned(moveToDay(due, '2026-11-23', 'Asia/Tokyo'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-23',
      time: '21:00',
    })
  })

  test('keeps the local clock time across a DST change', () => {
    const due = zonedToUtc('2026-03-07', '09:00', NY) // EST, 14:00Z
    const moved = moveToDay(due, '2026-03-09', NY) // EDT, 13:00Z
    expect(iso(moved)).toBe('2026-03-09T13:00:00.000Z')
    expect(utcToZoned(moved, NY).time).toBe('09:00')
  })
})

describe('startOfLocalDay / localDayRange', () => {
  test('local midnight in Yangon', () => {
    expect(iso(startOfLocalDay('2026-11-21', 'Asia/Yangon'))).toBe('2026-11-20T17:30:00.000Z')
  })

  test.each([
    ['Asia/Tokyo', '2026-11-21', 24],
    ['UTC', '2026-11-21', 24],
    [NY, '2026-03-08', 23], // spring forward
    [NY, '2026-11-01', 25], // fall back
  ])('%s %s lasts %i h', (zone, date, hours) => {
    const { start, end } = localDayRange(date, zone)
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(hours)
    expect(utcToZoned(start, zone)).toEqual({ date, time: '00:00' })
  })
})

describe('roundUpToLocalHour', () => {
  test('in Yangon (+06:30) it lands on :00 local, not :00 UTC', () => {
    const at = zonedToUtc('2026-11-21', '07:10', 'Asia/Yangon')
    expect(utcToZoned(roundUpToLocalHour(at, 'Asia/Yangon'), 'Asia/Yangon')).toEqual({
      date: '2026-11-21',
      time: '08:00',
    })
  })

  test('a whole local hour stays where it is', () => {
    const at = zonedToUtc('2026-11-21', '18:00', 'Asia/Tokyo')
    expect(roundUpToLocalHour(at, 'Asia/Tokyo')).toEqual(at)
  })

  test('seconds past the hour round up', () => {
    const at = new Date('2026-11-21T09:00:01Z')
    expect(iso(roundUpToLocalHour(at, 'UTC'))).toBe('2026-11-21T10:00:00.000Z')
  })

  test('rolls over to the next local day', () => {
    const at = zonedToUtc('2026-11-21', '23:20', NY)
    expect(utcToZoned(roundUpToLocalHour(at, NY), NY)).toEqual({
      date: '2026-11-22',
      time: '00:00',
    })
  })
})

describe('cityOf', () => {
  test.each([
    ['Asia/Yangon', 'Yangon'],
    ['Asia/Tokyo', 'Tokyo'],
    ['America/New_York', 'New York'],
    ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['UTC', 'UTC'],
  ])('%s → %s', (zone, city) => {
    expect(cityOf(zone)).toBe(city)
  })
})

describe('addCalendarDays / mondayOf (Plan weeks, spec 003 research R10)', () => {
  test('adds days across month and year ends', () => {
    expect(addCalendarDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addCalendarDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addCalendarDays('2026-11-16', 7)).toBe('2026-11-23')
  })
  test.each([
    ['2026-11-16', '2026-11-16'], // Monday
    ['2026-11-20', '2026-11-16'], // Friday
    ['2026-11-22', '2026-11-16'], // Sunday
    ['2027-01-01', '2026-12-28'],
  ])('the week of %s starts on %s', (date, monday) => {
    expect(mondayOf(date)).toBe(monday)
  })
})
