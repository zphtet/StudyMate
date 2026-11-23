// @vitest-environment node
// Spec 003 FR-009, research.md R7: Shift / Sleep / Free from busy_segments rows, clashes, and the
// "Move to …" suggestion (first free gap after the clash that fits the lesson, rounded up to the
// student's local hour, searched 7 days ahead).
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import {
  clashAt,
  displaySegments,
  freeGaps,
  mergeSegments,
  suggestSlot,
  type Busy,
} from './availability'
import { rotationDays } from '@/features/shifts/rotation'

const at = (s: string) => new Date(s)
const span = (kind: Busy['kind'], start: string, end: string): Busy => ({
  kind,
  start: at(start),
  end: at(end),
})
const iso = (segments: { start: Date; end: Date; kind?: string }[]) =>
  segments.map((s) => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() }))

describe('displaySegments', () => {
  test('maps shift → Shift, sleep and night → Sleep, and ignores quiet hours', () => {
    const rows = [
      { kind: 'shift', start: at('2026-11-20T13:00:00Z'), end: at('2026-11-20T22:00:00Z') },
      { kind: 'sleep', start: at('2026-11-20T22:00:00Z'), end: at('2026-11-21T06:00:00Z') },
      { kind: 'night', start: at('2026-11-21T14:00:00Z'), end: at('2026-11-21T22:00:00Z') },
      { kind: 'quiet', start: at('2026-11-21T12:00:00Z'), end: at('2026-11-21T23:00:00Z') },
    ]
    expect(displaySegments(rows).map((s) => s.kind)).toEqual(['shift', 'sleep', 'sleep'])
  })
})

describe('mergeSegments', () => {
  test('joins overlapping and touching segments of the same kind', () => {
    const merged = mergeSegments([
      span('sleep', '2026-11-21T00:00:00Z', '2026-11-21T04:00:00Z'),
      span('sleep', '2026-11-21T03:00:00Z', '2026-11-21T06:00:00Z'),
      span('sleep', '2026-11-21T06:00:00Z', '2026-11-21T07:00:00Z'),
    ])
    expect(iso(merged)).toEqual([
      { kind: 'sleep', start: '2026-11-21T00:00:00.000Z', end: '2026-11-21T07:00:00.000Z' },
    ])
  })

  test('a shift wins over sleep where they overlap; the result is sorted and disjoint', () => {
    const merged = mergeSegments([
      span('sleep', '2026-11-21T14:00:00Z', '2026-11-21T22:00:00Z'),
      span('shift', '2026-11-21T13:00:00Z', '2026-11-21T22:00:00Z'),
      span('sleep', '2026-11-21T22:00:00Z', '2026-11-22T06:00:00Z'),
      span('shift', '2026-11-22T10:00:00Z', '2026-11-22T12:00:00Z'),
      span('sleep', '2026-11-22T09:00:00Z', '2026-11-22T13:00:00Z'),
    ])
    expect(iso(merged)).toEqual([
      { kind: 'shift', start: '2026-11-21T13:00:00.000Z', end: '2026-11-21T22:00:00.000Z' },
      { kind: 'sleep', start: '2026-11-21T22:00:00.000Z', end: '2026-11-22T06:00:00.000Z' },
      { kind: 'sleep', start: '2026-11-22T09:00:00.000Z', end: '2026-11-22T10:00:00.000Z' },
      { kind: 'shift', start: '2026-11-22T10:00:00.000Z', end: '2026-11-22T12:00:00.000Z' },
      { kind: 'sleep', start: '2026-11-22T12:00:00.000Z', end: '2026-11-22T13:00:00.000Z' },
    ])
  })
})

describe('freeGaps', () => {
  test('returns the uncovered parts of the range', () => {
    const segments = mergeSegments([
      span('shift', '2026-11-21T02:00:00Z', '2026-11-21T05:00:00Z'),
      span('sleep', '2026-11-21T05:00:00Z', '2026-11-21T08:00:00Z'),
      span('shift', '2026-11-21T20:00:00Z', '2026-11-22T03:00:00Z'),
    ])
    expect(iso(freeGaps(segments, at('2026-11-21T00:00:00Z'), at('2026-11-22T00:00:00Z')))).toEqual(
      [
        { start: '2026-11-21T00:00:00.000Z', end: '2026-11-21T02:00:00.000Z' },
        { start: '2026-11-21T08:00:00.000Z', end: '2026-11-21T20:00:00.000Z' },
      ],
    )
  })

  test('the whole range is free without segments', () => {
    const from = at('2026-11-21T00:00:00Z')
    const to = at('2026-11-22T00:00:00Z')
    expect(freeGaps([], from, to)).toEqual([{ start: from, end: to }])
  })
})

describe('clashAt', () => {
  const segments = mergeSegments([
    span('shift', '2026-11-20T13:00:00Z', '2026-11-20T22:00:00Z'),
    span('sleep', '2026-11-20T22:00:00Z', '2026-11-21T06:00:00Z'),
  ])

  test('inside a shift → shift', () => {
    expect(clashAt(segments, at('2026-11-20T14:00:00Z'))).toBe('shift')
  })
  test('inside a sleep block → sleep', () => {
    expect(clashAt(segments, at('2026-11-21T01:00:00Z'))).toBe('sleep')
  })
  test('on the start edge → busy', () => {
    expect(clashAt(segments, at('2026-11-20T13:00:00Z'))).toBe('shift')
  })
  test('on the end edge → free', () => {
    expect(clashAt(segments, at('2026-11-21T06:00:00Z'))).toBeNull()
  })
  test('outside → null', () => {
    expect(clashAt(segments, at('2026-11-21T09:00:00Z'))).toBeNull()
  })
})

describe('suggestSlot', () => {
  // Night shift Fri 22:00 – Sat 07:00 Tokyo (13:00Z – 22:00Z), then sleep until 15:00 Tokyo.
  const tokyo = mergeSegments([
    span('shift', '2026-11-20T13:00:00Z', '2026-11-20T22:00:00Z'),
    span('sleep', '2026-11-20T22:00:00Z', '2026-11-21T06:00:00Z'),
    span('sleep', '2026-11-21T14:00:00Z', '2026-11-21T22:00:00Z'), // Sat 23:00 – Sun 07:00
  ])

  test('the first free gap after the clash, leaving the lesson’s minutes, rounded up to the hour', () => {
    const suggestion = suggestSlot({
      segments: tokyo,
      after: at('2026-11-20T14:00:00Z'),
      minutes: 90,
      timeZone: 'Asia/Tokyo',
    })
    // free from 15:00 Tokyo; + 90 min = 16:30 → 17:00 Tokyo
    expect(suggestion?.toISOString()).toBe('2026-11-21T08:00:00.000Z')
  })

  test('short lessons still leave at least 60 minutes', () => {
    const suggestion = suggestSlot({
      segments: tokyo,
      after: at('2026-11-20T14:00:00Z'),
      minutes: 15,
      timeZone: 'Asia/Tokyo',
    })
    expect(suggestion?.toISOString()).toBe('2026-11-21T07:00:00.000Z') // 16:00 Tokyo
  })

  test('rounds up to the local hour in Yangon (+06:30)', () => {
    const segments = mergeSegments([span('shift', '2026-11-21T00:00:00Z', '2026-11-21T03:10:00Z')])
    const suggestion = suggestSlot({
      segments,
      after: at('2026-11-21T01:00:00Z'),
      minutes: 60,
      timeZone: 'Asia/Yangon',
    })
    // free from 09:40 Yangon; + 60 = 10:40 → 11:00 Yangon = 04:30Z
    expect(suggestion?.toISOString()).toBe('2026-11-21T04:30:00.000Z')
  })

  test('skips gaps that are too short', () => {
    const segments = mergeSegments([
      span('shift', '2026-11-21T00:00:00Z', '2026-11-21T04:00:00Z'),
      span('sleep', '2026-11-21T04:30:00Z', '2026-11-21T10:00:00Z'),
    ])
    const suggestion = suggestSlot({
      segments,
      after: at('2026-11-21T01:00:00Z'),
      minutes: 60,
      timeZone: 'UTC',
    })
    expect(suggestion?.toISOString()).toBe('2026-11-21T11:00:00.000Z')
  })

  test('caps the rounded time at the end of the gap', () => {
    const segments = mergeSegments([
      span('shift', '2026-11-21T00:00:00Z', '2026-11-21T04:20:00Z'),
      span('sleep', '2026-11-21T05:30:00Z', '2026-11-21T12:00:00Z'),
    ])
    const suggestion = suggestSlot({
      segments,
      after: at('2026-11-21T01:00:00Z'),
      minutes: 60,
      timeZone: 'UTC',
    })
    // 04:20 + 60 = 05:20 → 06:00 is past the gap end, so 05:30
    expect(suggestion?.toISOString()).toBe('2026-11-21T05:30:00.000Z')
  })

  test('returns null when nothing fits within 7 days', () => {
    const segments = mergeSegments([span('shift', '2026-11-20T00:00:00Z', '2026-11-28T12:00:00Z')])
    expect(
      suggestSlot({ segments, after: at('2026-11-20T06:00:00Z'), minutes: 60, timeZone: 'UTC' }),
    ).toBeNull()
  })
})

// ── Spec 005 SC-002: properties over overnight and back-to-back shifts (research R12) ─────────
// Rows are built the way busy_segments() builds them: working shifts that never overlap (the
// EXCLUDE constraint), a sleep block `after_shift_buffer` after a shift that asks for one, and
// `night` rows outside waking hours. Shifts are up to 24 h, so many cross local midnight.
describe('availability properties (spec 005 SC-002)', () => {
  const MINUTE = 60_000
  const BASE = Date.parse('2026-11-01T00:00:00Z')
  const BUFFER = 30

  type Row = { kind: string; start: Date; end: Date }

  const shiftPlan = fc.array(
    fc.record({
      gap: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 24 * 60 })), // 0 = back-to-back
      minutes: fc.integer({ min: 30, max: 24 * 60 }),
      sleep: fc.oneof(
        fc.constant(0),
        fc.integer({ min: 8, max: 24 }).map((n) => n * 30),
      ),
    }),
    { maxLength: 12 },
  )
  const nightPlan = fc.array(
    fc.record({
      offset: fc.integer({ min: 0, max: 20 * 24 * 60 }),
      minutes: fc.integer({ min: 1, max: 12 * 60 }),
    }),
    { maxLength: 6 },
  )
  const window = fc.record({
    offset: fc.integer({ min: -24 * 60, max: 10 * 24 * 60 }),
    minutes: fc.integer({ min: 1, max: 7 * 24 * 60 }),
  })

  function rowsFrom(
    plan: { gap: number; minutes: number; sleep: number }[],
    nights: { offset: number; minutes: number }[],
  ) {
    const rows: Row[] = []
    let cursor = BASE
    for (const { gap, minutes, sleep } of plan) {
      const start = cursor + gap * MINUTE
      const end = start + minutes * MINUTE
      rows.push({ kind: 'shift', start: new Date(start), end: new Date(end) })
      if (sleep > 0) {
        const sleepStart = end + BUFFER * MINUTE
        rows.push({
          kind: 'sleep',
          start: new Date(sleepStart),
          end: new Date(sleepStart + sleep * MINUTE),
        })
      }
      cursor = end
    }
    for (const { offset, minutes } of nights) {
      const start = BASE + offset * MINUTE
      rows.push({ kind: 'night', start: new Date(start), end: new Date(start + minutes * MINUTE) })
    }
    return rows
  }

  const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) =>
    a.start < b.end && b.start < a.end

  test('merged segments are ordered, disjoint and non-empty', () => {
    fc.assert(
      fc.property(shiftPlan, nightPlan, (plan, nights) => {
        const merged = mergeSegments(displaySegments(rowsFrom(plan, nights)))
        merged.forEach((s, i) => {
          expect(s.start < s.end).toBe(true)
          if (i > 0) expect(merged[i - 1].end <= s.start).toBe(true)
        })
      }),
    )
  })

  test('every working minute shows as Shift (a shift wins over sleep and night)', () => {
    fc.assert(
      fc.property(shiftPlan, nightPlan, (plan, nights) => {
        const rows = rowsFrom(plan, nights)
        const merged = mergeSegments(displaySegments(rows))
        for (const shift of rows.filter((r) => r.kind === 'shift')) {
          for (const at of [shift.start, new Date(shift.end.getTime() - 1)]) {
            expect(clashAt(merged, at)).toBe('shift')
          }
        }
      }),
    )
  })

  test('free gaps and busy segments cover the range exactly, without overlapping', () => {
    fc.assert(
      fc.property(shiftPlan, nightPlan, window, (plan, nights, { offset, minutes }) => {
        const merged = mergeSegments(displaySegments(rowsFrom(plan, nights)))
        const from = new Date(BASE + offset * MINUTE)
        const to = new Date(from.getTime() + minutes * MINUTE)
        const busy = merged
          .filter((s) => overlaps(s, { start: from, end: to }))
          .map((s) => ({
            start: s.start < from ? from : s.start,
            end: s.end > to ? to : s.end,
          }))
        const pieces = [...busy, ...freeGaps(merged, from, to)].sort(
          (a, b) => a.start.getTime() - b.start.getTime(),
        )
        let cursor = from.getTime()
        for (const piece of pieces) {
          expect(piece.start.getTime()).toBe(cursor)
          cursor = piece.end.getTime()
        }
        expect(cursor).toBe(to.getTime())
      }),
    )
  })

  test('no free window lies inside a shift or a sleep block', () => {
    fc.assert(
      fc.property(shiftPlan, nightPlan, window, (plan, nights, { offset, minutes }) => {
        const rows = rowsFrom(plan, nights)
        const merged = mergeSegments(displaySegments(rows))
        const from = new Date(BASE + offset * MINUTE)
        const gaps = freeGaps(merged, from, new Date(from.getTime() + minutes * MINUTE))
        for (const gap of gaps) {
          for (const row of rows) expect(overlaps(gap, row)).toBe(false)
        }
      }),
    )
  })

  // US2: shifts a rotation generates, with random preset times (some overnight) in a zone with
  // daylight saving. A day whose shift would overlap the one before is skipped, as the EXCLUDE
  // constraint makes the repo do.
  const clock = fc
    .record({ h: fc.integer({ min: 0, max: 23 }), m: fc.constantFrom(0, 30) })
    .map(({ h, m }) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  const pair = fc.tuple(clock, clock).filter(([a, b]) => a !== b)
  const rotation = fc.record({
    sequence: fc.stringMatching(/^[DENO]{1,28}$/),
    presets: fc.record({ D: pair, E: pair, N: pair }),
    sleep: fc.integer({ min: 8, max: 24 }).map((n) => n * 30),
  })

  function rotationRows({
    sequence,
    presets,
    sleep,
  }: {
    sequence: string
    presets: { D: [string, string]; E: [string, string]; N: [string, string] }
    sleep: number
  }) {
    const days = rotationDays(
      { sequence, startDate: '2026-10-20' },
      presets,
      'America/New_York',
      '2026-10-20',
      '2026-11-15',
    )
    const rows: Row[] = []
    let lastEnd = 0
    for (const { shift } of days) {
      if (!shift || shift.start.getTime() < lastEnd) continue
      rows.push({ kind: 'shift', start: shift.start, end: shift.end })
      if (shift.blockSleep) {
        const sleepStart = shift.end.getTime() + BUFFER * MINUTE
        rows.push({
          kind: 'sleep',
          start: new Date(sleepStart),
          end: new Date(sleepStart + sleep * MINUTE),
        })
      }
      lastEnd = shift.end.getTime()
    }
    return rows
  }

  test('rotation shifts: segments are disjoint, cover the range with the free gaps, and every working minute is Shift', () => {
    fc.assert(
      fc.property(rotation, (plan) => {
        const rows = rotationRows(plan)
        const merged = mergeSegments(displaySegments(rows))
        merged.forEach((s, i) => {
          expect(s.start < s.end).toBe(true)
          if (i > 0) expect(merged[i - 1].end <= s.start).toBe(true)
        })
        for (const shift of rows.filter((r) => r.kind === 'shift')) {
          expect(clashAt(merged, shift.start)).toBe('shift')
        }
        const from = new Date('2026-10-25T00:00:00Z')
        const to = new Date('2026-11-08T00:00:00Z')
        for (const gap of freeGaps(merged, from, to)) {
          for (const row of rows) expect(overlaps(gap, row)).toBe(false)
        }
      }),
      { numRuns: 50 },
    )
  })
})
