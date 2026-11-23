# Research: Shift Calendar and Availability (005)

Decisions for `plan.md`. Each one: **Decision**, **Rationale**, **Alternatives**. The spec was clarified on 2026-11-22 (five answers); R-numbers are cited from the plan, data model and contracts.

## R1. Build on what 0_init and 003 already have

- **Decision**: 005 adds the screens, writes and rotation logic around what exists, and changes the existing SQL only where 005's rules need it:
  - Keep `shifts` and `shift_patterns` (one record per shift, `end_at > start_at`, ≤ 24 h, the no-overlap `EXCLUDE` for working shifts) and their RLS: the student writes their own rows, the linked Admin only reads (`shifts_admin_read`, `patterns_admin_read`). That is FR-008 already.
  - Keep `busy_segments()` (shift, sleep after a shift starting `after_shift_buffer` minutes later, night outside waking hours, quiet) and `status_at()` / `status_now()` (on_shift / sleeping / free / unknown + next change, covered by `005_status_now.test.sql`). They already implement FR-004–FR-006.
  - Keep 003's `lib/availability.ts` (`displaySegments`, `mergeSegments`, `freeGaps`) and `DayBar`, and the shared `CalendarMonth` (its `badge` and `onSelectDay` slots).
  - Add: a migration (R3, R4, R9, R2's off rule), `features/shifts`, the overnight helper in `lib/time.ts` (docs/technical-spec.md already names it but it was never written), the Shifts screens, the Today banner, the Me row and the Admin card's status line.
- **Rationale**: the availability rules have one definition in SQL that 003 (Plan, clashes) already uses and 006 will use for holding notifications. A second copy in TypeScript would drift.
- **Alternatives**: compute availability in TypeScript from raw shifts. Rejected: two definitions of "busy" (constitution IV says one rule set).

## R2. Saving one shift: local date and times in, UTC instants out

- **Decision**:
  - The form sends `{ date (YYYY-MM-DD), type, start (HH:mm), end (HH:mm), blockSleep }`. The server reads the student's zone from the profile and computes the instants with a pure `shiftInstants({ date, start, end }, timeZone)` in `lib/time.ts`: start is `date start` local; if `end ≤ start` the end is on the next local date (US1 scenario 2, constitution IV); the duration comes from the two instants, so a daylight-saving night is 8 h or 10 h, not 9 h (Edge Cases).
  - **Off** is stored as the whole local day `[date 00:00, next date 00:00)` with no times asked, `sleep_minutes = 0`. It is not busy (`busy_segments` skips `off`), so the day counts as free, and the overlap rule doesn't apply to it. On a fall-back day the local day is 25 h, so the 24 h CHECK applies to working shifts only; Off may be up to 25 h (`shifts_max_length`, replacing 0_init's unnamed CHECK). A new CHECK `shifts_off_no_sleep (type <> 'off' or sleep_minutes = 0)` stops `busy_segments` from adding a sleep block after an Off day.
  - **Sleep**: `blockSleep` on stores `sleep_minutes = profiles.sleep_minutes`, off stores 0. The form turns it on by default for Night (US1 scenario 4). Sleep starts `after_shift_buffer` (30 min, existing column, not editable in 005) after the shift ends, which is why 08-ShiftEdit.png says "until 15:30" for a shift ending 07:00.
  - **More than 24 h**: times alone give at most 24 h (an end ≤ the start is the next day), so only a daylight-saving fall-back night can exceed it (08:00 → 08:00 is 25 h). The server checks the computed instants (`shift_too_long`, "A shift can be at most 24 h"); the existing CHECK is the backstop.
  - **Overlap**: inside the save transaction, the server looks for a working shift of the same student that overlaps and fails `shift_overlap` with its start and end, so the form can say "Overlaps your shift {time}" (Edge Cases). The `EXCLUDE` constraint stays the final word: a race that slips past the check (SQLSTATE `23P01`) maps to the same code.
- **Rationale**: the student thinks in local dates and clock times; storing instants keeps one record per shift and survives a time-zone change (Edge Cases).
- **Alternatives**: send instants from the browser. Rejected: the phone's zone can differ from the profile's, and the server must own the conversion rule.

## R3. One set of preset times per student

- **Decision**: a new `profiles.shift_presets jsonb not null` with the current default `{"D":["09:00","18:00"],"E":["14:00","23:00"],"N":["22:00","07:00"]}`. Add shift pre-fills from it; rotations generate from it (clarification 2, FR-002). `shift_patterns.presets` is dropped in the same migration (it would be a second source; the table is empty on dev, checked first as in 004). Custom has no preset: choosing Custom keeps the times already in the form.
- **Rationale**: one place to change "Night", used everywhere.
- **Alternatives**: keep presets per rotation and copy them to the profile. Rejected: two copies that can disagree.

## R4. Rotations: generate rows, extend them every day, replace on change

- **Decision**:
  - A rotation is `shift_patterns { sequence, start_date }` with letters D, E, N and O (the editor offers no C: a Custom day has no preset times). Local date `start_date + i` gets letter `sequence[i mod length]`; O makes no row.
  - **Generation** is a pure `rotationDays(pattern, presets, timeZone, from, to)` in `features/shifts/rotation.ts` → shift inputs (R2's rules, Night with sleep). The repo inserts them in one statement that skips a local date when the student already has a shift starting that date that is hand-entered (`pattern_id is null`) or `overridden`, of any type (Off included) and from any rotation, or a working shift overlapping the new one (spec Edge Cases: the student's own day wins; this also keeps days the student deleted from an earlier rotation). It also skips a generated shift that would start at or before now.
  - **Horizon**: on save, today → today + 56 days (8 weeks, US2 scenario 1). `shift_patterns.generated_until date` records how far it got. A daily Vercel Cron call, `GET /api/cron/rotations` (`CRON_SECRET`, like 002's purge), extends every active rotation to today + 56. "Extended weekly" in the spec is met by a daily top-up, which also recovers from a missed run.
  - **Editing a generated shift** sets `overridden = true` (FR-007). **Deleting** one turns it into an `overridden` Off row for that day, so the rotation doesn't fill the day again; deleting a hand-entered shift removes it.
  - **Change or delete** (clarification 1, FR-007, FR-010), in one transaction: delete this rotation's shifts with `overridden = false` and `start_at > now` (not started yet, so a running shift is never rewritten); set the old row `active = false`; on a change insert the new rotation and generate it. Past shifts and overridden shifts keep their `pattern_id` (history). A partial unique index `shift_patterns_one_active (student_id) where active` makes FR-010 a database rule.
- **Rationale**: concrete rows keep one record per shift for every reader (calendar, `busy_segments`, the Admin's Plan); the daily top-up keeps the horizon without a long job.
- **Alternatives**:
  - Compute rotation shifts on read. Rejected: overrides, overlap and `busy_segments` would all need a second path.
  - pg_cron + SQL generator. Rejected: the generator is time-zone logic that is easier to test as a pure TypeScript function; the project already runs cron through Vercel.

## R5. The month calendar (07-Shifts.png)

- **Decision**: a pure `monthChips(shifts, timeZone, month)` in `features/shifts/calendar.ts` turns shifts into chips per local date:
  - a same-day shift → one chip "9–18";
  - an overnight shift → "22→" on its start date and "→07" on the next date, each marked `joinsNext` / `joinsPrev` so they render square at the shared edge and meet across the cell border, including the Sunday→Monday row break (US1 scenario 3);
  - Off → "Off" (muted).

  The chips render in `CalendarMonth`'s badge slot; tapping a day selects it for the day timeline (`onSelectDay`). Colours are new theme tokens `--shift-day`, `--shift-evening`, `--shift-night`, `--shift-custom` with matching `-foreground` tokens, added to the contrast test (constitution V).
- **Rationale**: reuses 003's calendar and its keyboard model; all the date logic stays in one tested function.
- **Alternatives**: a new grid with bars spanning columns. Rejected: a second calendar component and its own keyboard handling.

## R6. The day timeline (US3)

- **Decision**: one read per month, `GET /api/shifts?month=YYYY-MM`, returns the month's shifts (from the day before the month to the day after) and the merged busy segments for the same range (`busy_segments` → `displaySegments` → `mergeSegments`). The selected day's view is computed in the browser:
  - the bar is 003's `DayBar` (shift, sleep, free; quiet ignored as in 003);
  - the list is a pure `dayTimeline(shifts, segments, timeZone, date)` in `features/shifts/timeline.ts`: each shift with its type ("Night shift (from Thu)" when it began the day before, "22:00 → Sat 07:00" when it ends the next day), each sleep block after a shift ("Sleep, auto 8 h"), and each free window inside waking hours ("Free to study").
- **Rationale**: one request for the screen; moving between days is instant.
- **Alternatives**: a request per selected day. Rejected: a round trip on every tap.

## R7. Today's shift banner (04-Today.png)

- **Decision**: `GET /api/shifts/today` returns the working shift that is running now or starts before the end of the student's local today (type, start, end), and the free window now if any (`until`) or the next free time. Today shows:
  - line 1: "Night shift tonight · 22:00–07:00" (a night shift later today), "{Type} shift today · 09:00–18:00", or "On shift until 07:00" (running);
  - line 2: "Good window to study now: about {n} min free" when free now, else "Free again at {time}".

  No banner without a working shift today. The shared busy-segment read (`getBusySegments`, now in 003's `plan-repo.ts`) moves to `src/server/availability.ts` first, as its own commit, because 005 is its second user.
- **Rationale**: the banner answers "can I study now?" from the same segments as the Plan.
- **Alternatives**: add fields to 003's `GET /api/today`. Rejected: Today composes queries per feature (004's pattern); the banner has its own data and cache key.

## R8. The Admin's live status (US4 scenario 1, 3)

- **Decision**: `getStudentCards` (004) gains one statement for all linked students: `status_now(student)` per student through a lateral join, plus the type of the shift running now. The card shows under the name:
  - on_shift → "On {type} shift until {time}"; sleeping → "Sleeping until {time}"; free → "Free now"; unknown → "No shift info".
  - `{time}` is the student's local time with the Admin's beside it when the zones differ ("07:00 · 05:30 yours", constitution IV). A change more than a day away also shows the weekday.

  The cards query refetches when the earliest `until` passes (a timer) and on window focus; no Realtime (the status changes with the clock, not only with writes).
  - 16-AdminStudents.png's "Night shift tonight · active 2 h ago" is replaced by the spec's live status; "active 2 h ago" isn't in any spec (as 004 noted).
  - US4 scenario 3's "reminders use fixed times" is 006's.
- **Rationale**: one statement keeps 004's fixed query count; the existing SQL status is the single rule.
- **Alternatives**: compute the status in TypeScript from busy segments. Rejected: a second definition of the states.

## R9. The Sunday check (FR-009)

- **Decision**: `profiles.shifts_confirmed_week date` holds the Monday of the last week the student answered. A pure `weekCheck({ now, timeZone, confirmedWeek, hasShifts })` in `features/shifts/week-check.ts` says the card is due from Sunday 18:00 local until the next Monday 00:00, unless `confirmedWeek` is that Monday or `hasShifts` is false. It is shown only to students with at least one shift (otherwise there is nothing to check; the Shifts empty state applies). Confirm and Edit both call `confirmShiftWeek()`; Edit then opens Shifts on next Monday. Stored on the server so it stays dismissed on every device.
- **Rationale**: one date column covers the rule; 006 can send the push at the same moment from the same function.
- **Alternatives**: localStorage. Rejected: the clarification asks for every device.

## R10. Shift settings

- **Decision**: a "Shift settings" sheet on the Shifts screen edits preset times (Day, Evening, Night), sleep length (4–12 h in 30 min steps) and waking hours. Quiet hours are 006's (11-Profile.png lists them with reminders). `after_shift_buffer` keeps its 30 min default and isn't shown. The Me screen gets 11-Profile.png's "Shift calendar" row linking to Shifts, with "{n} shifts this week" or "No shifts this week".
- **Rationale**: settings live next to the calendar they affect; Me stays a list of links.
- **Alternatives**: a separate Me sub-page. Rejected: one more route for four fields.

## R11. Repeat on the editor (08-ShiftEdit.png)

- **Decision**: "Repeat" offers **Just this day** and **My rotation**. My rotation doesn't save the shift: **Save** opens `/s/shifts/rotation?start={date}&type={D|E|N|O}`, the rotation editor with this day as the start and this type as the first letter, and the rotation generates the day. It is disabled for Custom, which has no rotation letter (R4). **Every Friday** is left out: the spec has no weekly repeat, and FR-010 allows one rotation (a weekly repeat is a rotation with one working day, which the rotation editor can express). Listed as an intentional difference in contracts/ui-routes.md.
- **Rationale**: constitution order: spec over screenshot; flagged instead of guessed.
- **Alternatives**: a second repeat kind. Rejected: not in the spec, and it would conflict with FR-010.

## R12. Tests

- **Decision**:
  - Vitest unit tests first for `shiftInstants` (overnight, New York daylight-saving nights, Tokyo, Yangon +06:30), `rotationDays`, `monthChips` (row break), `dayTimeline`, `weekCheck`, the status text.
  - SC-002 property tests with `fast-check` (already a dev dependency): for random overnight, back-to-back and rotation-generated shifts, the merged segments are ordered and disjoint, free ∪ busy covers the range exactly, and no free window lies inside a shift or sleep block.
  - pgTAP: the Off CHECK, one active rotation, `busy_segments` adds no sleep after Off, the shift and pattern RLS (student writes own; linked Admin reads, can't write; unlinked Admin and other students see nothing).
  - Repo tests against the dev database (overlap message, generation skipping overridden and hand-entered days, change/delete semantics, cron top-up idempotent).
  - Playwright US1–US4 at 390×844 and 1280×800 with axe, against a production build on :3100.
- **Rationale**: constitution III; the time math is where bugs hide.

## R13. Out of scope

- Notifications and SC-003 (no reminder inside a shift or sleep) are 006's; 005 leaves `next_free_at()` as it is for that.
- Offline shift edits are 008's.
- Quiet hours UI is 006's.
- No new dependencies.
