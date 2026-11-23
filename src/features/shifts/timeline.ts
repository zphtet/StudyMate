import { freeGaps } from '@/lib/availability'
import { localDayRange } from '@/lib/time'
import type { Segment, ShiftView } from './types'

// The selected day's list on the Shifts screen (spec 005 US3; research R6). Pure, from the month
// read, so choosing another day needs no request. Sleep rows come from the shifts themselves: they
// start `after_shift_buffer` minutes after the shift ends (busy_segments' rule), whereas the merged
// segments join that sleep with the night outside waking hours. Free rows are the gaps in the merged
// segments, so they are inside waking hours (FR-004; quiet hours are ignored, as on 003's bar).

type Span = {
  start: string
  end: string
  /** Began on an earlier day ("Night shift (from Thu)"). */
  startsBefore: boolean
  /** Ends on a later day ("22:00 → Sat 07:00"). */
  endsAfter: boolean
}

export type TimelineEntry =
  | ({ kind: 'shift'; shift: ShiftView } & Span)
  | ({ kind: 'sleep'; minutes: number } & Span)
  | ({ kind: 'free' } & Span)

const ORDER: Record<TimelineEntry['kind'], number> = { shift: 0, sleep: 1, free: 2 }

/** Shifts, sleep blocks and free windows overlapping the student's local `date`, in time order. */
export function dayTimeline({
  shifts,
  segments,
  timeZone,
  date,
  afterShiftBuffer,
}: {
  shifts: ShiftView[]
  /** Merged busy segments covering the day (MonthShifts.segments). */
  segments: Segment[]
  timeZone: string
  date: string
  /** data-model.md Profile.after_shift_buffer, in minutes */
  afterShiftBuffer: number
}): TimelineEntry[] {
  const day = localDayRange(date, timeZone)
  const overlapsDay = (start: Date, end: Date) => start < day.end && end > day.start
  const span = (start: Date, end: Date): Span => ({
    start: start.toISOString(),
    end: end.toISOString(),
    startsBefore: start < day.start,
    endsAfter: end > day.end,
  })

  const entries: TimelineEntry[] = []
  for (const shift of shifts) {
    const start = new Date(shift.startAt)
    const end = new Date(shift.endAt)
    if (overlapsDay(start, end)) entries.push({ kind: 'shift', shift, ...span(start, end) })
    if (shift.sleepMinutes === 0) continue
    const sleepStart = new Date(end.getTime() + afterShiftBuffer * 60_000)
    const sleepEnd = new Date(sleepStart.getTime() + shift.sleepMinutes * 60_000)
    if (overlapsDay(sleepStart, sleepEnd)) {
      entries.push({ kind: 'sleep', minutes: shift.sleepMinutes, ...span(sleepStart, sleepEnd) })
    }
  }
  const busy = segments.map((s) => ({
    kind: s.kind,
    start: new Date(s.start),
    end: new Date(s.end),
  }))
  for (const gap of freeGaps(busy, day.start, day.end)) {
    entries.push({ kind: 'free', ...span(gap.start, gap.end) })
  }
  return entries.sort((a, b) => a.start.localeCompare(b.start) || ORDER[a.kind] - ORDER[b.kind])
}

/** The day's real bounds and its Shift / Sleep segments clipped to them, for 003's DayBar. */
export function dayBar({
  segments,
  timeZone,
  date,
}: {
  segments: Segment[]
  timeZone: string
  date: string
}): { start: string; end: string; segments: Segment[] } {
  const { start, end } = localDayRange(date, timeZone)
  const [from, to] = [start.toISOString(), end.toISOString()]
  return {
    start: from,
    end: to,
    segments: segments
      .filter((s) => s.start < to && s.end > from)
      .map((s) => ({
        kind: s.kind,
        start: s.start < from ? from : s.start,
        end: s.end > to ? to : s.end,
      })),
  }
}
