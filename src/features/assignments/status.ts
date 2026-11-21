import { calendarDaysBetween } from '@/lib/time'
import type { Due, DeadlineStatus } from './types'

// Deadline rules (spec 003 FR-004, FR-005; research.md R1, R2). Pure: repos pass the deadlines, the
// done set and 002's lock state (computeLocks), plus one `now` per request and the student's zone.
// Status is derived, never stored.

const DUE_SOON_MS = 24 * 3_600_000

/** Lesson deadline, else course deadline, else none (same rule as SQL effective_due). */
export function effectiveDue(
  lessonDue: Date | null | undefined,
  courseDue: Date | null | undefined,
): Date | null {
  return lessonDue ?? courseDue ?? null
}

type Timing = { dueAt: Date | null; now: Date; timeZone: string }

/** overdue → due soon → (caller's next rule), for a deadline that isn't done. */
function timing({ dueAt, now, timeZone }: Timing): Omit<Due, 'dueAt'> | null {
  if (!dueAt) return null
  if (now > dueAt) {
    // 0 = due earlier today ("Overdue"); 1+ = "N days late", by the student's calendar.
    return { status: 'overdue', daysLate: calendarDaysBetween(dueAt, now, timeZone) }
  }
  if (dueAt.getTime() - now.getTime() <= DUE_SOON_MS) return { status: 'due_soon', daysLate: 0 }
  return null
}

const is = (status: DeadlineStatus) => ({ status, daysLate: 0 })

/** One lesson: done → overdue → due soon → locked → upcoming → none (FR-005). */
export function deadlineStatus({
  done,
  locked,
  ...time
}: Timing & { done: boolean; locked: boolean }): Omit<Due, 'dueAt'> {
  if (done) return is('done')
  const soon = timing(time)
  if (soon) return soon
  if (locked) return is('locked')
  return is(time.dueAt ? 'upcoming' : 'none')
}

/** One course deadline (Plan card): done only when every counting lesson is done. */
export function courseDeadlineStatus({
  lessonCount,
  doneCount,
  ...time
}: Timing & { dueAt: Date; lessonCount: number; doneCount: number }): Omit<Due, 'dueAt'> {
  if (lessonCount > 0 && doneCount >= lessonCount) return is('done')
  return timing(time) ?? is('upcoming')
}
