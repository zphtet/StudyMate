import { z } from 'zod'
import { mondayOf } from '@/lib/time'
import type { StudentRef } from './types'

// The Plan's URL state (?student=<id>&view=week|month&week=<monday>&month=<YYYY-MM>; research R10), shared by the server seed, the
// Route Handler and the client so all three pick the same defaults.

/** A Monday as YYYY-MM-DD in the student's zone. */
export const weekSchema = z.iso
  .date()
  .refine((date) => mondayOf(date) === date, { message: 'invalid_input' })

/** A calendar month, YYYY-MM. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'invalid_input' })

export type PlanViewMode = 'week' | 'month'

/**
 * The URL's student when linked, else the first by name; the week when it's a Monday; the month when
 * valid, else the month of the shown week. null week or month = the current one in the student's zone.
 */
export function planSelection(students: StudentRef[], params: URLSearchParams) {
  const wanted = params.get('student')
  const student = students.find((s) => s.id === wanted) ?? students[0] ?? null
  const week = weekSchema.safeParse(params.get('week')).data ?? null
  const view: PlanViewMode = params.get('view') === 'month' ? 'month' : 'week'
  const month = monthSchema.safeParse(params.get('month')).data ?? week?.slice(0, 7) ?? null
  return { student, view, week, month }
}
