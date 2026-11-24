import type { ShiftView } from './types'

/**
 * The first cached working shift that overlaps [start, end), other than `exceptId`: the same rule as
 * the server's findOverlap (repo.ts; spec 005 FR-003), so a shift added offline is refused on the
 * device as it would be online (spec 008 contracts/ui-routes.md). The server checks again on sync.
 */
export function findLocalOverlap(
  shifts: readonly ShiftView[],
  { start, end, exceptId }: { start: Date; end: Date; exceptId?: string },
): ShiftView | null {
  return (
    shifts
      .filter(
        (s) =>
          s.type !== 'off' &&
          s.id !== exceptId &&
          new Date(s.startAt) < end &&
          new Date(s.endAt) > start,
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null
  )
}
