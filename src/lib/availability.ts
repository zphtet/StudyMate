import { roundUpToLocalHour } from './time'

// Availability for display and clash checks (spec 003 FR-009, research.md R7). Pure: the server
// reads busy time from SQL busy_segments() (one definition, shared with 005/006) and passes the rows
// here. Free time is everything not covered by a Shift or Sleep segment.
//
// Kinds: `shift` → Shift; `sleep` (after a shift) and `night` (outside waking hours) → Sleep.
// `quiet` hours only delay notifications (006), so they are ignored here.

export type BusyKind = 'shift' | 'sleep'
export type Busy = { kind: BusyKind; start: Date; end: Date }
export type Gap = { start: Date; end: Date }

const DISPLAY_KIND: Record<string, BusyKind | undefined> = {
  shift: 'shift',
  sleep: 'sleep',
  night: 'sleep',
}

/** busy_segments rows → Shift / Sleep segments (quiet hours and unknown kinds dropped). */
export function displaySegments(rows: readonly { kind: string; start: Date; end: Date }[]): Busy[] {
  return rows.flatMap(({ kind, start, end }) => {
    const display = DISPLAY_KIND[kind]
    return display && end > start ? [{ kind: display, start, end }] : []
  })
}

/** Sorted, merged intervals (overlapping or touching ones joined). */
function union(intervals: readonly Gap[]): Gap[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: Gap[] = []
  for (const { start, end } of sorted) {
    const last = merged.at(-1)
    if (last && start <= last.end) {
      if (end > last.end) last.end = end
    } else {
      merged.push({ start, end })
    }
  }
  return merged
}

/** `intervals` minus `cut` (both sorted and disjoint). */
function subtract(intervals: readonly Gap[], cut: readonly Gap[]): Gap[] {
  return intervals.flatMap((interval) => {
    let pieces: Gap[] = [interval]
    for (const c of cut) {
      pieces = pieces.flatMap((p) => {
        if (c.end <= p.start || c.start >= p.end) return [p]
        return [
          ...(c.start > p.start ? [{ start: p.start, end: c.start }] : []),
          ...(c.end < p.end ? [{ start: c.end, end: p.end }] : []),
        ]
      })
    }
    return pieces
  })
}

/**
 * Disjoint, sorted segments: same-kind overlaps are joined, and a shift wins over sleep where they
 * overlap (a night shift during "outside waking hours" shows as Shift).
 */
export function mergeSegments(segments: readonly Busy[]): Busy[] {
  const shifts = union(segments.filter((s) => s.kind === 'shift'))
  const sleeps = subtract(union(segments.filter((s) => s.kind === 'sleep')), shifts)
  return [
    ...shifts.map((s) => ({ kind: 'shift' as const, ...s })),
    ...sleeps.map((s) => ({ kind: 'sleep' as const, ...s })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Free gaps inside [from, to). */
export function freeGaps(segments: readonly Busy[], from: Date, to: Date): Gap[] {
  return subtract([{ start: from, end: to }], union(segments))
}

/** What the student is doing at an instant: start inclusive, end exclusive. */
export function clashAt(segments: readonly Busy[], at: Date): BusyKind | null {
  const inside = segments.filter((s) => s.start <= at && at < s.end)
  if (inside.some((s) => s.kind === 'shift')) return 'shift'
  return inside.length > 0 ? 'sleep' : null
}

const SEARCH_DAYS = 7
const MIN_MINUTES = 60

/**
 * "Move to …" (spec 003 FR-009): the first free gap after `after` that fits the lesson's minutes (at
 * least 60), then gap start + minutes rounded up to the student's local hour, capped at the gap end.
 * Null when nothing fits within 7 days (no Move button then).
 */
export function suggestSlot({
  segments,
  after,
  minutes,
  timeZone,
}: {
  segments: readonly Busy[]
  after: Date
  minutes: number
  timeZone: string
}): Date | null {
  const need = Math.max(minutes, MIN_MINUTES) * 60_000
  const horizon = new Date(after.getTime() + SEARCH_DAYS * 86_400_000)
  const gap = freeGaps(segments, after, horizon).find(
    (g) => g.end.getTime() - g.start.getTime() >= need,
  )
  if (!gap) return null
  const rounded = roundUpToLocalHour(new Date(gap.start.getTime() + need), timeZone)
  return rounded > gap.end ? gap.end : rounded
}
