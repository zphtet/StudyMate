// Spec 005 US3 (T049): the selected day's list (research R6; data-model.md Profile.after_shift_buffer,
// Profile.waking_start, Profile.waking_end). Segments are built the way the server builds them
// (busy_segments → displaySegments → mergeSegments) with the defaults: waking 08:00–23:00, a 30 min
// buffer before sleep.
import { describe, expect, test } from 'vitest'
import { displaySegments, mergeSegments } from '@/lib/availability'
import { addCalendarDays, zonedToUtc } from '@/lib/time'
import { dayBar, dayTimeline, type TimelineEntry } from './timeline'
import type { Segment, ShiftType, ShiftView } from './types'

const TOKYO = 'Asia/Tokyo'
const NY = 'America/New_York'
const BUFFER = 30

let nextId = 0
function shift(
  type: ShiftType,
  [startDate, start]: [string, string],
  [endDate, end]: [string, string],
  { sleepMinutes = 0, timeZone = TOKYO } = {},
): ShiftView {
  return {
    id: `s${nextId++}`,
    type,
    startAt: zonedToUtc(startDate, start, timeZone).toISOString(),
    endAt: zonedToUtc(endDate, end, timeZone).toISOString(),
    sleepMinutes,
    fromRotation: false,
    overridden: false,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }
}

/** busy_segments for [first − 1, last + 1]: working shifts, sleep after them, nights outside 08–23. */
function segmentsOf(shifts: ShiftView[], dates: string[], timeZone = TOKYO): Segment[] {
  const at = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000)
  const days = [addCalendarDays(dates[0], -1), ...dates, addCalendarDays(dates.at(-1) ?? '', 1)]
  const rows = [
    ...shifts
      .filter((s) => s.type !== 'off')
      .map((s) => ({ kind: 'shift', start: new Date(s.startAt), end: new Date(s.endAt) })),
    ...shifts
      .filter((s) => s.sleepMinutes > 0)
      .map((s) => ({
        kind: 'sleep',
        start: at(s.endAt, BUFFER),
        end: at(s.endAt, BUFFER + s.sleepMinutes),
      })),
    ...days.map((day) => ({
      kind: 'night',
      start: zonedToUtc(day, '23:00', timeZone),
      end: zonedToUtc(addCalendarDays(day, 1), '08:00', timeZone),
    })),
  ]
  return mergeSegments(displaySegments(rows)).map((s) => ({
    kind: s.kind,
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }))
}

function timeline(shifts: ShiftView[], date: string, timeZone = TOKYO) {
  return dayTimeline({
    shifts,
    segments: segmentsOf(shifts, [date], timeZone),
    timeZone,
    date,
    afterShiftBuffer: BUFFER,
  })
}

/** [kind, local start, local end, startsBefore, endsAfter], with the shift's type for shifts. */
const rows = (entries: TimelineEntry[], timeZone = TOKYO) =>
  entries.map((e) => [
    e.kind === 'shift' ? e.shift.type : e.kind,
    new Date(e.start).toLocaleString('sv', { timeZone }).slice(5, 16),
    new Date(e.end).toLocaleString('sv', { timeZone }).slice(5, 16),
    e.startsBefore,
    e.endsAfter,
  ])

describe('dayTimeline', () => {
  test('a night shift from the day before, its sleep and the free window (quickstart 4)', () => {
    const night = shift('night', ['2026-11-20', '22:00'], ['2026-11-21', '07:00'], {
      sleepMinutes: 480,
    })
    expect(rows(timeline([night], '2026-11-21'))).toEqual([
      ['night', '11-20 22:00', '11-21 07:00', true, false],
      ['sleep', '11-21 07:30', '11-21 15:30', false, false],
      ['free', '11-21 15:30', '11-21 23:00', false, false],
    ])
  })

  test('a shift that ends the next day', () => {
    const night = shift('night', ['2026-11-20', '22:00'], ['2026-11-21', '07:00'], {
      sleepMinutes: 480,
    })
    expect(rows(timeline([night], '2026-11-20'))).toEqual([
      ['free', '11-20 08:00', '11-20 22:00', false, false],
      ['night', '11-20 22:00', '11-21 07:00', false, true],
    ])
  })

  test('sleep starts after the buffer; free time is only inside waking hours', () => {
    const day = shift('day', ['2026-11-18', '09:00'], ['2026-11-18', '18:00'], {
      sleepMinutes: 480,
    })
    const entries = timeline([day], '2026-11-18')
    expect(rows(entries)).toEqual([
      ['free', '11-18 08:00', '11-18 09:00', false, false],
      ['day', '11-18 09:00', '11-18 18:00', false, false],
      ['free', '11-18 18:00', '11-18 18:30', false, false],
      ['sleep', '11-18 18:30', '11-19 02:30', false, true],
    ])
    expect(entries.find((e) => e.kind === 'sleep')).toMatchObject({ minutes: 480 })
  })

  test('sleep from the evening before carries into the morning', () => {
    const evening = shift('evening', ['2026-11-19', '14:00'], ['2026-11-19', '23:00'], {
      sleepMinutes: 480,
    })
    expect(rows(timeline([evening], '2026-11-20'))).toEqual([
      ['sleep', '11-19 23:30', '11-20 07:30', true, false],
      ['free', '11-20 08:00', '11-20 23:00', false, false],
    ])
  })

  test('a day with no shift is free through waking hours', () => {
    expect(rows(timeline([], '2026-11-22'))).toEqual([
      ['free', '11-22 08:00', '11-22 23:00', false, false],
    ])
  })

  test('a day off is listed, and its waking hours are free', () => {
    const off = shift('off', ['2026-11-22', '00:00'], ['2026-11-23', '00:00'])
    expect(rows(timeline([off], '2026-11-22'))).toEqual([
      ['off', '11-22 00:00', '11-23 00:00', false, false],
      ['free', '11-22 08:00', '11-22 23:00', false, false],
    ])
    expect(rows(timeline([off], '2026-11-23'))).toEqual([
      ['free', '11-23 08:00', '11-23 23:00', false, false],
    ])
  })

  test('back-to-back shifts are two rows with no free time between them', () => {
    const day = shift('custom', ['2026-11-18', '09:00'], ['2026-11-18', '14:00'])
    const evening = shift('evening', ['2026-11-18', '14:00'], ['2026-11-18', '23:00'])
    expect(rows(timeline([day, evening], '2026-11-18'))).toEqual([
      ['free', '11-18 08:00', '11-18 09:00', false, false],
      ['custom', '11-18 09:00', '11-18 14:00', false, false],
      ['evening', '11-18 14:00', '11-18 23:00', false, false],
    ])
  })

  test('a daylight-saving day uses its real bounds (New York, 23 h)', () => {
    // Clocks go forward at 02:00 on Sun 14 Mar 2027: the night shift is 8 h, not 9.
    const night = shift('night', ['2027-03-13', '22:00'], ['2027-03-14', '07:00'], {
      timeZone: NY,
    })
    const entries = timeline([night], '2027-03-14', NY)
    expect(Date.parse(night.endAt) - Date.parse(night.startAt)).toBe(8 * 3_600_000)
    expect(rows(entries, NY)).toEqual([
      ['night', '03-13 22:00', '03-14 07:00', true, false],
      ['free', '03-14 08:00', '03-14 23:00', false, false],
    ])
  })
})

describe('dayBar', () => {
  test('clips the segments to the local day', () => {
    const night = shift('night', ['2026-11-20', '22:00'], ['2026-11-21', '07:00'], {
      sleepMinutes: 480,
    })
    const bar = dayBar({
      segments: segmentsOf([night], ['2026-11-21']),
      timeZone: TOKYO,
      date: '2026-11-21',
    })
    const local = (iso: string) =>
      new Date(iso).toLocaleString('sv', { timeZone: TOKYO }).slice(5, 16)
    expect([local(bar.start), local(bar.end)]).toEqual(['11-21 00:00', '11-22 00:00'])
    expect(bar.segments.map((s) => [s.kind, local(s.start), local(s.end)])).toEqual([
      ['shift', '11-21 00:00', '11-21 07:00'],
      ['sleep', '11-21 07:00', '11-21 15:30'],
      ['sleep', '11-21 23:00', '11-22 00:00'],
    ])
  })
})
