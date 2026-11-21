// @vitest-environment node
// Spec 003 FR-009, research.md R7: Shift / Sleep / Free from busy_segments rows, clashes, and the
// "Move to …" suggestion (first free gap after the clash that fits the lesson, rounded up to the
// student's local hour, searched 7 days ahead).
import { describe, expect, test } from 'vitest'
import {
  clashAt,
  displaySegments,
  freeGaps,
  mergeSegments,
  suggestSlot,
  type Busy,
} from './availability'

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
