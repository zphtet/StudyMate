import type { ShiftType } from '@/generated/prisma/client'
import type { BusyKind } from '@/lib/availability'
import type { ShiftPresets } from './schemas'

// Response shapes of the 005 Route Handlers (specs/005-shifts/contracts/route-handlers.md › Shared
// types). Instants are ISO 8601 UTC strings, calendar dates YYYY-MM-DD in the student's zone, clock
// times HH:mm. Input types come from schemas.ts (z.infer).

export type { ShiftType }

export type ShiftView = {
  id: string
  type: ShiftType
  startAt: string
  endAt: string
  sleepMinutes: number
  /** pattern_id is set: a rotation generated this shift. */
  fromRotation: boolean
  overridden: boolean
}

/** busy_segments rows, merged and disjoint (lib/availability.ts mergeSegments). */
export type Segment = { kind: BusyKind; start: string; end: string }

export type ShiftSettings = {
  presets: ShiftPresets
  sleepMinutes: number
  wakingStart: string
  wakingEnd: string
  /** Read-only in 005 (research R10). */
  afterShiftBuffer: number
}

/** GET /api/shifts?month=YYYY-MM */
export type MonthShifts = {
  month: string
  /** YYYY-MM-DD in the student's zone */
  today: string
  timeZone: string
  /** Shifts overlapping the month ±1 day, in start order. */
  shifts: ShiftView[]
  /** busy_segments for the same range, merged (research R6). */
  segments: Segment[]
  /** Any shift at all, in any month: the Shifts empty state (contracts/ui-routes.md). */
  hasShifts: boolean
}

/** GET /api/shifts/settings */
export type ShiftSettingsResponse = {
  settings: ShiftSettings
  rotation: { sequence: string; startDate: string; generatedUntil: string | null } | null
}

/** status_now() for one student (FR-006; research R8): the Admin's student card. */
export type AvailabilityStatus = {
  state: 'on_shift' | 'sleeping' | 'free' | 'unknown'
  /** The next change, within 2 days; null for unknown. */
  until: string | null
  /** The running shift's type when on_shift. */
  shiftType: ShiftType | null
}

/** Today's shift banner (research R7) and the Me row (research R10). */
export type TodayBanner = {
  /** The working shift running now, or else the first one starting before the end of local today. */
  shift: { type: ShiftType; startAt: string; endAt: string; running: boolean } | null
  /** From the merged segments, looking 2 days ahead. */
  free: { now: true; until: string } | { now: false; nextAt: string | null }
  /** Working shifts starting this local Monday to Sunday. */
  weekShifts: number
}

/**
 * GET /api/shifts/today: the Today banner, the Sunday check and the Me row. The browser judges
 * `weekCheck` again with its own clock (src/lib/week-check.ts), so the card appears at 18:00.
 */
export type ShiftsToday = TodayBanner & {
  now: string
  timeZone: string
  /** data-model.md Profile.shifts_confirmed_week */
  confirmedWeek: string | null
  hasShifts: boolean
  weekCheck: { due: boolean; week: string }
}
