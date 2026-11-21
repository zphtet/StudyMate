import { z } from 'zod'
import { mondayOf } from '@/lib/time'
import type { StudentRef } from './types'

// The Plan's URL state (?student=<id>&week=<monday>; research R10), shared by the server seed, the
// Route Handler and the client so all three pick the same defaults.

/** A Monday as YYYY-MM-DD in the student's zone. */
export const weekSchema = z.iso
  .date()
  .refine((date) => mondayOf(date) === date, { message: 'invalid_input' })

/** The URL's student when linked, else the first by name; the URL's week when it's a Monday. */
export function planSelection(students: StudentRef[], params: URLSearchParams) {
  const wanted = params.get('student')
  const student = students.find((s) => s.id === wanted) ?? students[0] ?? null
  const week = weekSchema.safeParse(params.get('week')).data ?? null
  return { student, week }
}
