import { addCalendarDays } from '@/lib/time'

// Active days, streaks and the weekly goal count (spec 004 FR-006, FR-008; research.md R4). Pure:
// they read local calendar dates (`YYYY-MM-DD` in the student's zone, from dailyActivity), so a day
// is split at the student's local midnight and shifts play no part.

/** 10 study minutes make a day active (FR-006). */
export const ACTIVE_SECONDS = 600

export type DayActivity = { date: string; seconds: number; completions: number }

/** ≥ 1 completion or ≥ 10 study minutes (FR-006). */
export const isActiveDay = (day: { seconds: number; completions: number }) =>
  day.completions >= 1 || day.seconds >= ACTIVE_SECONDS

/** The active dates among a student's days. */
export const activeDates = (days: DayActivity[]) => days.filter(isActiveDay).map((d) => d.date)

/**
 * Consecutive active dates ending today. Before the student studies today, the run ending yesterday
 * still counts, so a streak doesn't drop to 0 in the morning.
 */
export function currentStreak(dates: Iterable<string>, today: string) {
  const active = new Set(dates)
  let day = active.has(today) ? today : addCalendarDays(today, -1)
  let count = 0
  while (active.has(day)) {
    count++
    day = addCalendarDays(day, -1)
  }
  return count
}

/** The longest run of consecutive active dates. */
export function bestStreak(dates: Iterable<string>) {
  const sorted = [...new Set(dates)].sort()
  let best = 0
  let length = 0
  sorted.forEach((date, i) => {
    length = i > 0 && addCalendarDays(sorted[i - 1], 1) === date ? length + 1 : 1
    best = Math.max(best, length)
  })
  return best
}

/** Active days in the week starting `monday` (Mon–Sun); may be more than the goal (FR-008). */
export function weekActiveDays(dates: Iterable<string>, monday: string) {
  const sunday = addCalendarDays(monday, 6)
  return new Set([...dates].filter((d) => d >= monday && d <= sunday)).size
}
