# Contract: Server Actions — 005

All actions live in `src/features/shifts/actions.ts`, use 001's `action(schema, fn)` wrapper and return `Result<T>` (`{ ok: true, data } | { ok: false, code, details? }`). Each one calls its guard first. The student id always comes from the guard, never from input. Schemas are in `src/features/shifts/schemas.ts` and are shared with the forms.

## Field schemas

```ts
localDate   = z.iso.date()                                  // YYYY-MM-DD in the student's zone
clockTime   = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) // HH:mm
shiftType   = z.enum(['day', 'evening', 'night', 'off', 'custom'])
sequence    = z.string().regex(/^[DENO]{1,28}$/).refine(s => /[DEN]/.test(s), 'rotationEmpty')
presetPair  = z.tuple([clockTime, clockTime]).refine(([a, b]) => a !== b, 'presetSameTimes')
```

## Shifts (research R2)

### `saveShift(input)`
```ts
input = {
  shiftId?: uuid          // absent = new
  date: localDate         // the shift's day (local date of its start)
  type: shiftType
  start?: clockTime       // required unless type = 'off'
  end?: clockTime         // required unless type = 'off'
  blockSleep: boolean     // ignored for 'off'
}
→ Result<{ shift: ShiftView }>
```
- Guard: `requireRole('student')`.
- Instants from `shiftInstants({ date, start, end }, me.timezone)`; Off = the whole local day. `sleep_minutes = blockSleep ? profile.sleep_minutes : 0`.
- An edited generated shift gets `overridden = true` (FR-007).
- Errors:
  - `shift_too_long` — more than 24 h of real time (FR-001). Times alone give at most 24 h (an end ≤ the start is the next day), so this happens on a daylight-saving fall-back night; checked on the computed instants, with the CHECK `shifts_max_length` as backstop. Off is the whole local day and is never refused (25 h on a fall-back day);
  - `shift_overlap` with `details: { start, end }` (ISO instants of the clashing shift) — "Overlaps your shift {time}"; also mapped from SQLSTATE `23P01`;
  - `shift_not_found` — `shiftId` isn't the caller's;
  - `invalid_input`.

### `deleteShift({ shiftId })`
→ `Result<{ removed: 'deleted' | 'off' }>`
- Guard: `requireRole('student')`. `shift_not_found` when not the caller's.
- A hand-entered shift is deleted. A generated one becomes an `overridden` Off row for its day, so the rotation doesn't fill it again (R4).

## Rotation (research R4; FR-007, FR-010)

### `saveRotation({ sequence, startDate })`
→ `Result<{ generatedUntil: localDate; skippedDays: localDate[] }>`
- Guard: `requireRole('student')`.
- One transaction: the active rotation (if any) is replaced: `active = false` and its non-overridden shifts with `start_at > now` are deleted (running and past shifts stay). Then the new rotation is inserted and generated from `max(startDate, today)` to today + 56 days, skipping shifts that would start at or before now.
- `skippedDays` lists days not generated because a hand-entered or overridden shift (any type, any rotation) starts that day, or a working shift overlaps (shown once after saving; data-model.md › Lifecycles).

### `deleteRotation()`
→ `Result<{ removed: number }>` (shifts not yet started that were deleted)
- Guard: `requireRole('student')`. `rotation_not_found` when there is no active rotation.

## Settings (research R3, R10; FR-002, FR-003, FR-004)

### `saveShiftSettings(input)`
```ts
input = {
  presets: { D: presetPair, E: presetPair, N: presetPair }
  sleepMinutes: z.number().int().min(240).max(720).multipleOf(30)
  wakingStart: clockTime
  wakingEnd: clockTime           // refine: wakingStart < wakingEnd ('wakingOrder')
}
→ Result<{ settings: ShiftSettings }>
```
- Guard: `requireRole('student')`.
- When the presets or the sleep length change and a rotation is active, its non-overridden shifts that haven't started are generated again (the same rule as a rotation change), so "Night" means the same times everywhere (clarification 2). Hand-entered and overridden shifts keep their times.

## Sunday check (research R9; FR-009)

### `confirmShiftWeek()`
→ `Result<{ week: localDate }>` (the Monday now confirmed)
- Guard: `requireRole('student')`. Sets `profiles.shifts_confirmed_week` to the next local Monday. Called by both Confirm and Edit; idempotent.

## Error codes (new)

| Code | When |
| --- | --- |
| `shift_overlap` | the shift overlaps another working shift of the student (`details.start`, `details.end`) |
| `shift_too_long` | longer than 24 h |
| `shift_not_found` | the shift isn't the caller's, or no longer exists |
| `rotation_not_found` | deleting when no rotation is active |

New validation keys: `validation.timeInvalid` (a working shift without times), `validation.rotationEmpty`, `validation.presetSameTimes`, `validation.wakingOrder`. Dates reuse `validation.dateInvalid`. Existing codes reused: `invalid_input`, `forbidden`, `offline`.

## Query invalidation after success

| Action | Optimistic | Invalidate |
| --- | --- | --- |
| `saveShift`, `deleteShift` | none (the editor closes on success) | `['shifts']` (prefix: month, today, settings), `['today']` |
| `saveRotation`, `deleteRotation` | none | `['shifts']` (prefix), `['today']` |
| `saveShiftSettings` | none | `['shifts']` (prefix) |
| `confirmShiftWeek` | `['shifts','today']` → `weekCheck.due = false` | `['shifts','today']` |

Admin screens (Plan, Students) refetch on focus and, for the status line, when `until` passes (research R8); there is no Realtime for shifts.
