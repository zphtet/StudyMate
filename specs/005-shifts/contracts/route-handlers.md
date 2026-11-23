# Contract: Route Handlers — 005

All handlers use 001's `handle()` wrapper: JSON on success, `{ error: { code, message } }` with 400/401/403/404. Each calls its guard first. Instants are ISO 8601 UTC strings, calendar dates `YYYY-MM-DD` in the student's zone, clock times `HH:mm`.

## Shared types

```ts
type ShiftView = {
  id: string
  type: 'day' | 'evening' | 'night' | 'off' | 'custom'
  startAt: string
  endAt: string
  sleepMinutes: number
  fromRotation: boolean        // pattern_id is set
  overridden: boolean
}

type Segment = { kind: 'shift' | 'sleep'; start: string; end: string }   // merged, disjoint (003)

type ShiftSettings = {
  presets: { D: [string, string]; E: [string, string]; N: [string, string] }
  sleepMinutes: number
  wakingStart: string
  wakingEnd: string
  afterShiftBuffer: number     // read-only in 005 (research R10)
}
```

## Student

### GET `/api/shifts?month=YYYY-MM`
Guard: `requireRole('student')`. A missing or invalid `month` gives the student's current local month.
```ts
{
  month: string                // YYYY-MM
  today: string                // YYYY-MM-DD, student's zone
  timeZone: string
  shifts: ShiftView[]          // overlapping [first day − 1, last day + 1]
  segments: Segment[]          // busy_segments for the same range, merged (research R6)
  hasShifts: boolean           // any shift at all, in any month: the empty state (ui-routes.md)
}
```

### GET `/api/shifts/[shiftId]`
Guard: `requireRole('student')`. `{ shift: ShiftView }`; 404 `shift_not_found` when not the caller's.

### GET `/api/shifts/settings`
Guard: `requireRole('student')`.
```ts
{ settings: ShiftSettings; rotation: { sequence: string; startDate: string; generatedUntil: string | null } | null }
```

### GET `/api/shifts/today`
Guard: `requireRole('student')`. The Today banner, the Sunday check and the Me row (research R7, R9, R10).
```ts
{
  now: string
  shift: { type: ShiftView['type']; startAt: string; endAt: string; running: boolean } | null
  free: { now: true; until: string } | { now: false; nextAt: string | null }
  weekCheck: { due: boolean; week: string }      // week = the coming Monday; due is false when hasShifts is false (FR-009)
  timeZone: string                                // the student's zone, and
  confirmedWeek: string | null                    // the answered week: the browser judges weekCheck again
                                                  // with its own clock, so the card appears at 18:00
  weekShifts: number                              // working shifts this local Mon–Sun
  hasShifts: boolean
}
```
`shift` is the working shift running now, or else the first one starting before the end of local today; null otherwise. `free` comes from the merged segments (`freeGaps`); `nextAt` looks 2 days ahead.

## Admin

### GET `/api/admin/students/progress` (004, extended)
Each card gains:
```ts
status: {
  state: 'on_shift' | 'sleeping' | 'free' | 'unknown'
  until: string | null          // next change (status_now), null for unknown or > 2 days
  shiftType: ShiftView['type'] | null   // when on_shift
}
```
One added SQL statement for all students (research R8). The guard is unchanged (`requireRole('admin')`, links scope).

003's `GET /api/admin/plan` and clash endpoint are unchanged; they already read `busy_segments`.

## Cron

### GET `/api/cron/rotations`
Called daily by Vercel Cron (`vercel.json`) with `Authorization: Bearer $CRON_SECRET`, compared in constant time as in 002's purge. No user guard (plan.md › Complexity Tracking). Extends every active rotation to the student's local today + 56 days, idempotently.
```ts
{ rotations: number; inserted: number }
```
