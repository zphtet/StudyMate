import 'server-only'
import { clashAt, displaySegments, mergeSegments, suggestSlot, type Busy } from '@/lib/availability'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import type { Clash } from './types'

// Busy time and clashes for the Plan and the deadline pickers (spec 003 FR-009, research R7).
// Callers MUST have run requireAdminOf(studentId). busy_segments() allows server connections
// (auth.uid() is null; docs/technical-spec.md §6.3), so the guard is the access rule here.

const DAY_MS = 86_400_000

/** Shift / Sleep segments in [from, to), merged and disjoint (one busy_segments call). */
export async function getBusySegments(studentId: string, from: Date, to: Date): Promise<Busy[]> {
  const rows = await prisma.$queryRaw<{ kind: string; start_at: Date; end_at: Date }[]>`
    select kind, start_at, end_at
    from public.busy_segments(${studentId}::uuid, ${from}::timestamptz, ${to}::timestamptz)`
  return mergeSegments(
    displaySegments(rows.map((r) => ({ kind: r.kind, start: r.start_at, end: r.end_at }))),
  )
}

/**
 * Whether a future deadline at `at` falls inside the student's shift or sleep, and where "Move to …"
 * would put it (`minutes` of free time, at least 60). Past times never clash: they are "Already
 * overdue" instead.
 */
export async function clashFor(
  studentId: string,
  at: Date,
  minutes: number,
): Promise<Clash | null> {
  if (at.getTime() <= Date.now()) return null
  const student = await prisma.profile.findUnique({
    where: { id: studentId },
    select: { timezone: true },
  })
  if (!student) throw new NotFound('student_not_found')
  // A day before covers a shift that started earlier; 8 days after covers the 7-day search.
  const segments = await getBusySegments(
    studentId,
    new Date(at.getTime() - DAY_MS),
    new Date(at.getTime() + 8 * DAY_MS),
  )
  const kind = clashAt(segments, at)
  if (!kind) return null
  const suggestion = suggestSlot({ segments, after: at, minutes, timeZone: student.timezone })
  return { kind, suggestion: suggestion?.toISOString() ?? null }
}
