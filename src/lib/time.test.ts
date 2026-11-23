// @vitest-environment node
// Constitution IV: dates are judged in the viewer's own time zone (spec 002 "on date" unlock rule;
// spec 003 research.md R3: deadlines entered in the student's zone, days late by their calendar).
import { describe, expect, test } from 'vitest'
import {
  addCalendarDays,
  addMonths,
  calendarDaysBetween,
  cityOf,
  datesOfMonth,
  localDayRange,
  mondayOf,
  moveToDay,
  roundUpToLocalHour,
  shiftInstants,
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

describe('addMonths / datesOfMonth (Plan month, spec 003 FR-010)', () => {
  test('moves across year ends both ways', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
  })

  test('lists every day of the month, leap years included', () => {
    expect(datesOfMonth('2026-11')).toHaveLength(30)
    expect(datesOfMonth('2026-11')[0]).toBe('2026-11-01')
    expect(datesOfMonth('2026-11').at(-1)).toBe('2026-11-30')
    expect(datesOfMonth('2028-02')).toHaveLength(29)
  })
})

describe('shiftInstants (spec 005 FR-001, US1 scenario 2; research R2)', () => {
  const TOKYO = 'Asia/Tokyo'
  const YANGON = 'Asia/Yangon'

  test('a same-day shift starts and ends on its date', () => {
    const shift = shiftInstants({ date: '2026-11-20', start: '09:00', end: '18:00' }, TOKYO)
    expect(iso(shift.start)).toBe('2026-11-20T00:00:00.000Z')
    expect(iso(shift.end)).toBe('2026-11-20T09:00:00.000Z')
    expect(shift.minutes).toBe(9 * 60)
    expect(shift.endsNextDay).toBe(false)
  })

  test('an end before the start is the next morning: one record, 9 h', () => {
    const shift = shiftInstants({ date: '2026-11-20', start: '22:00', end: '07:00' }, TOKYO)
    expect(iso(shift.start)).toBe('2026-11-20T13:00:00.000Z')
    expect(iso(shift.end)).toBe('2026-11-20T22:00:00.000Z') // Sat 21 Nov 07:00 in Tokyo
    expect(shift.minutes).toBe(9 * 60)
    expect(shift.endsNextDay).toBe(true)
  })

  test('an end equal to the start is a full 24 h shift', () => {
    const shift = shiftInstants({ date: '2026-11-20', start: '08:00', end: '08:00' }, TOKYO)
    expect(shift.minutes).toBe(24 * 60)
    expect(shift.endsNextDay).toBe(true)
  })

  test('a half-hour zone (Yangon +06:30) keeps the local clock times', () => {
    const shift = shiftInstants({ date: '2026-11-20', start: '22:00', end: '07:00' }, YANGON)
    expect(iso(shift.start)).toBe('2026-11-20T15:30:00.000Z')
    expect(iso(shift.end)).toBe('2026-11-21T00:30:00.000Z')
    expect(shift.minutes).toBe(9 * 60)
  })

  test('across the New York fall-back night, the length comes from the instants', () => {
    // Clocks go back at 02:00 on Sun 1 Nov 2026: 22:00 → 07:00 is 10 h of real time.
    expect(shiftInstants({ date: '2026-10-31', start: '22:00', end: '07:00' }, NY).minutes).toBe(
      10 * 60,
    )
    // 08:00 → 08:00 is 25 h, which saving refuses (FR-001: at most 24 h).
    expect(shiftInstants({ date: '2026-10-31', start: '08:00', end: '08:00' }, NY).minutes).toBe(
      25 * 60,
    )
  })

  test('across the New York spring-forward night, the shift is an hour shorter', () => {
    // Clocks go forward at 02:00 on Sun 14 Mar 2027.
    expect(shiftInstants({ date: '2027-03-13', start: '22:00', end: '07:00' }, NY).minutes).toBe(
      8 * 60,
    )
  })

  test('without times (Off) the shift is the whole local day', () => {
    const off = shiftInstants({ date: '2026-11-20', start: null, end: null }, TOKYO)
    expect(iso(off.start)).toBe('2026-11-19T15:00:00.000Z')
    expect(iso(off.end)).toBe('2026-11-20T15:00:00.000Z')
    expect(off.minutes).toBe(24 * 60)
    expect(off.endsNextDay).toBe(false)
    // The local day is 25 h long on the fall-back day.
    expect(shiftInstants({ date: '2026-11-01', start: null, end: null }, NY).minutes).toBe(25 * 60)
  })
})
