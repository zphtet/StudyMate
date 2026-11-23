import type { AvailabilityStatus, ShiftType } from './types'

// The Admin's line about a student's live status (spec 005 US4 scenarios 1 and 3; research R8):
// "On night shift until 07:00", "Sleeping until 15:30", "Free now", "No shift info". The state and
// its next change come from SQL status_now() (one rule, FR-006); this only picks the line and
// whether its time needs a weekday. The hook below words it in the viewer's language.

const DAY_MS = 86_400_000

export type StatusLine =
  | { kind: 'on_shift'; shiftType: ShiftType | null; until: Date | null; showWeekday: boolean }
  | { kind: 'sleeping'; until: Date | null; showWeekday: boolean }
  | { kind: 'free' }
  | { kind: 'unknown' }

export function statusLine(status: AvailabilityStatus, now: Date): StatusLine {
  const until = status.until ? new Date(status.until) : null
  // "A change more than a day away also shows the weekday" (contracts/ui-routes.md).
  const showWeekday = until !== null && until.getTime() - now.getTime() > DAY_MS
  switch (status.state) {
    case 'on_shift':
      return { kind: 'on_shift', shiftType: status.shiftType, until, showWeekday }
    case 'sleeping':
      return { kind: 'sleeping', until, showWeekday }
    case 'free':
      return { kind: 'free' }
    case 'unknown':
      return { kind: 'unknown' }
  }
}
