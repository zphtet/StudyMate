import { mondayOf } from '@/lib/time'
import type { StudentRef } from './types'

// The Plan's URL state (?student=<id>&view=week|month&week=<monday>&month=<YYYY-MM>; research R10),
// shared by the server seed, the Route Handlers and the client so all three pick the same defaults.
// Plain checks, not zod: this module ships to the browser with the Plan (T066).

/** A real calendar date, YYYY-MM-DD. */
function isDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  )
}

/** A Monday as YYYY-MM-DD (in the student's zone). */
export function isWeek(value: string | null): value is string {
  return value !== null && isDate(value) && mondayOf(value) === value
}

/** A calendar month, YYYY-MM. */
export function isMonth(value: string | null): value is string {
  return value !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export type PlanViewMode = 'week' | 'month'

/**
 * The URL's student when linked, else the first by name; the week when it's a Monday; the month when
 * valid, else the month of the shown week. null week or month = the current one in the student's zone.
 */
export function planSelection(students: StudentRef[], params: URLSearchParams) {
  const wanted = params.get('student')
  const student = students.find((s) => s.id === wanted) ?? students[0] ?? null
  const rawWeek = params.get('week')
  const week = isWeek(rawWeek) ? rawWeek : null
  const view: PlanViewMode = params.get('view') === 'month' ? 'month' : 'week'
  const rawMonth = params.get('month')
  const month = isMonth(rawMonth) ? rawMonth : (week?.slice(0, 7) ?? null)
  return { student, view, week, month }
}
