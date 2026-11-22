import { addCalendarDays } from '@/lib/time'
import type { Forecast } from './types'

// The finish forecast of one course (spec 004 US3 scenario 2; research.md R6). Pure. The pace is the
// lessons completed in the course over the last 14 local days; the deadline is the student's own
// course deadline (course_assignments.due_at as a local date), not courses.target_date.

const PACE_DAYS = 14

export function forecast({
  published,
  done,
  doneLast14,
  today,
  dueOn,
}: {
  published: number
  done: number
  doneLast14: number
  /** YYYY-MM-DD in the student's zone */
  today: string
  /** The course deadline's local date, or null */
  dueOn: string | null
}): Forecast {
  if (published === 0) return { kind: 'empty' }
  const remaining = Math.max(published - done, 0)
  if (remaining === 0) return { kind: 'finished' }
  if (doneLast14 === 0) return { kind: 'no_pace', remaining }
  const finishOn = addCalendarDays(today, Math.ceil(remaining / (doneLast14 / PACE_DAYS)))
  if (!dueOn) return { kind: 'no_deadline', remaining, finishOn }
  return { kind: finishOn <= dueOn ? 'on_track' : 'behind', finishOn, dueOn }
}
