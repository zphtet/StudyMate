import { addCalendarDays, mondayOf, todayIn, utcToZoned } from '@/lib/time'

// The Sunday check (spec 005 FR-009; research R9): "Next week's shifts — correct?" is due from Sunday
// 18:00 in the student's time until the new week starts, unless they already answered for that week
// (data-model.md Profile.shifts_confirmed_week) or have no shifts at all. Pure, so the browser can
// judge it by its own clock and the card appears at 18:00 without a request.

const DUE_FROM = '18:00'

export function weekCheck({
  now,
  timeZone,
  confirmedWeek,
  hasShifts,
}: {
  now: Date
  timeZone: string
  confirmedWeek: string | null
  hasShifts: boolean
}) {
  const today = todayIn(timeZone, now)
  /** The coming Monday: tomorrow on a Sunday. */
  const week = addCalendarDays(mondayOf(today), 7)
  const isSundayEvening =
    addCalendarDays(today, 1) === week && utcToZoned(now, timeZone).time >= DUE_FROM
  return { due: hasShifts && isSundayEvening && confirmedWeek !== week, week }
}
