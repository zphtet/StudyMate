import 'server-only'
import { displaySegments, mergeSegments, type Busy } from '@/lib/availability'
import { prisma } from '@/lib/prisma'

// Busy time read from busy_segments() (spec 003 FR-009, spec 005 FR-005). Shared by the Admin Plan
// (003) and the student's Shifts screens (005 research R7). busy_segments() allows server
// connections (auth.uid() is null; docs/technical-spec.md §6.3), so callers MUST run their guard
// first: requireAdminOf(studentId) for an Admin, requireRole('student') with their own id.

/** Shift / Sleep segments in [from, to), merged and disjoint (one busy_segments call). */
export async function getBusySegments(studentId: string, from: Date, to: Date): Promise<Busy[]> {
  const rows = await prisma.$queryRaw<{ kind: string; start_at: Date; end_at: Date }[]>`
    select kind, start_at, end_at
    from public.busy_segments(${studentId}::uuid, ${from}::timestamptz, ${to}::timestamptz)`
  return mergeSegments(
    displaySegments(rows.map((r) => ({ kind: r.kind, start: r.start_at, end: r.end_at }))),
  )
}
