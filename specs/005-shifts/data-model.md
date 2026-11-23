# Data Model: Shift Calendar and Availability (005)

The tables `shifts` and `shift_patterns`, their RLS, the profile settings (`sleep_minutes`, `after_shift_buffer`, `waking_start`, `waking_end`, `quiet_start`, `quiet_end`) and the functions `busy_segments`, `next_free_at`, `status_at`, `status_now` already exist (`0_init`, `20261120190000_status_now_states`; docs/data-model.md §3–4). 005 adds:
- two profile columns and one `shift_patterns` column, and drops `shift_patterns.presets`;
- one CHECK on `shifts` and one partial unique index on `shift_patterns`;
- the rules the app applies when it writes shifts and generates rotations.

Field names are the database names; Prisma uses camelCase.

## Entities

### Shift (`shifts`)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid → profiles | the caller (from the guard), never client input |
| `type` | `day` / `evening` / `night` / `off` / `custom` | from the form; `off` is a whole local day (research R2) |
| `start_at` | timestamptz | the form's local date and start time in the student's zone; `off`: local 00:00 |
| `end_at` | timestamptz | `> start_at`; the next local date when the end time is ≤ the start time (US1 scenario 2); `off`: the next local 00:00. Existing CHECK `end_at > start_at`. **Replaced CHECK** `shifts_max_length`: `end_at - start_at ≤ 24 h`, or ≤ 25 h for `off` (the whole local day on a fall-back day; FR-001) |
| `sleep_minutes` | smallint ≥ 0 | `profiles.sleep_minutes` when "Block sleep after this shift" is on, else 0 (FR-003). **New CHECK** `shifts_off_no_sleep`: `type <> 'off' or sleep_minutes = 0` |
| `pattern_id` | uuid → shift_patterns, null | set on rows a rotation generated; kept on history when the rotation is replaced (FR-007) |
| `overridden` | bool | `true` once the student edits or deletes a generated shift (R4) |
| `client_op_id` | uuid, null, unique | unused until 008 |
| `created_at` | timestamptz | |

Existing `EXCLUDE` (no overlapping working shifts per student, `off` exempt) and index `shifts_student_time (student_id, start_at)`. The "day" of a shift is the local date of `start_at`.

### ShiftPattern (`shift_patterns`) — a rotation

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid → profiles | the caller (from the guard), never client input |
| `sequence` | text | existing CHECK `^[DENOC]{1,28}$`; the 005 editor offers D, E, N, O only (research R4) |
| `start_date` | date | the student's local date for letter 1 |
| `active` | bool | **new partial unique index** `shift_patterns_one_active (student_id) where active` (FR-010) |
| `generated_until` | date, null, **new** | last local date generated; the cron top-up continues from the day after (R4) |
| `created_at` | timestamptz | |
| ~~`presets`~~ | | **dropped**: preset times live on the profile (R3) |

### Profile (`profiles`) — the student's shift settings

| Field | Type | Rules |
| --- | --- | --- |
| `shift_presets` | jsonb, **new**, not null | `{"D":["HH:mm","HH:mm"],"E":[…],"N":[…]}`, default Day 09:00–18:00, Evening 14:00–23:00, Night 22:00–07:00; edited in Shift settings (FR-002). Each pair: start ≠ end; end ≤ start means overnight |
| `shifts_confirmed_week` | date, null, **new** | the Monday of the last week the student answered the Sunday check (FR-009, R9) |
| `sleep_minutes` | smallint (existing, 480) | 240–720 in steps of 30 (R10) |
| `waking_start`, `waking_end` | time (existing, 08:00 / 23:00) | start < end (R10) |
| `after_shift_buffer` | smallint (existing, 30) | not edited in 005 |
| `quiet_start`, `quiet_end` | time, null (existing) | edited in 006 |

## Derived values (never stored)

| Value | Definition | Where |
| --- | --- | --- |
| Shift instants | `shiftInstants({ date, start, end }, timeZone)`: local start; end on the next local date when `end ≤ start`; minutes from the instants (daylight saving) | `lib/time.ts` |
| Busy segments | `busy_segments(student, from, to)` → shift / sleep / night / quiet rows | SQL; read through `server/availability.ts` |
| Display segments | `displaySegments` + `mergeSegments` (shift, sleep; night counts as sleep; quiet dropped) | `lib/availability.ts` (003) |
| Free windows | `freeGaps(segments, from, to)` (FR-004) | `lib/availability.ts` |
| Live status | `status_now(student)` → on_shift / sleeping / free / unknown + `until` (FR-006) | SQL |
| Calendar chips | `monthChips(shifts, timeZone, month)` | `features/shifts/calendar.ts` |
| Day timeline rows | `dayTimeline(shifts, segments, timeZone, date)` | `features/shifts/timeline.ts` |
| Rotation days | `rotationDays(pattern, presets, timeZone, from, to)` | `features/shifts/rotation.ts` |
| Sunday check due | `weekCheck({ now, timeZone, confirmedWeek, hasShifts })` | `features/shifts/week-check.ts` |

## Lifecycles

### Shift

```text
hand-entered:  save ─► stored ─edit─► stored ─delete─► gone
generated:     rotation ─► stored (overridden = false)
                 ├─ edit   ─► overridden = true (kept by every regeneration)
                 ├─ delete ─► overridden Off row for that day (the rotation won't refill it)
                 └─ rotation changed / deleted, start_at > now ─► deleted (then regenerated on a change)
rows that have started (start_at ≤ now: past and running) are never touched by a rotation change
```

### Rotation

```text
save ─► active, generated today … today+56 (generated_until)
daily cron ─► generated_until … today+56 (idempotent)
change ─► old: active = false, its non-overridden shifts with start_at > now deleted ─► new: active, generated
delete ─► active = false, its non-overridden shifts with start_at > now deleted
```

A generated day is skipped when the student already has, starting that local date, a hand-entered (`pattern_id` null) or `overridden` shift of any type (Off included) and from any rotation, or a working shift overlapping the new one. A generated shift that would start at or before now is skipped too.

### Sunday check

```text
Sunday 18:00 local ─► due (if the student has any shift)
Confirm / Edit ─► shifts_confirmed_week = next Monday ─► not due
next Monday 00:00 local ─► not due (a new week)
```

## Migration `<UTC timestamp>_shifts`

Generated per docs/data-model.md §7 (diff the committed `schema.prisma` against the edited one), then completed by hand.

**Prisma diff**:
- `ALTER TABLE "profiles" ADD COLUMN "shift_presets" JSONB NOT NULL DEFAULT '{"D": ["09:00", "18:00"], "E": ["14:00", "23:00"], "N": ["22:00", "07:00"]}', ADD COLUMN "shifts_confirmed_week" DATE;`
- `ALTER TABLE "shift_patterns" DROP COLUMN "presets", ADD COLUMN "generated_until" DATE;` First check that `select count(*) from shift_patterns` is 0 on dev (quickstart §2).

**Added by hand**:
1. `alter table shifts add constraint shifts_off_no_sleep check (type <> 'off' or sleep_minutes = 0);`
2. `create unique index shift_patterns_one_active on shift_patterns (student_id) where active;`

**Second migration `<UTC timestamp>_shifts_off_day`** (SQL only, found while writing the T013 fixtures): 0_init's unnamed `shifts_check1` (`end_at - start_at <= 24 hours`) refused a 25 h Off day on a fall-back day. It is dropped on purpose and replaced by `shifts_max_length` (24 h for working shifts, 25 h for `off`).

No policy changes: `shifts_student`, `patterns_student` (own rows) and `shifts_admin_read`, `patterns_admin_read` (linked Admin, read only) already match FR-008 and the guards. Nothing SQL-only is dropped except `shifts_check1`, replaced on purpose by `shifts_max_length` (above).

`docs/data-model.md` is updated in the same change: the new columns, the CHECK, the index, `presets` moved to the profile.

## Guards (mirror the SQL)

| Guard | Allows | Mirrors |
| --- | --- | --- |
| `requireRole('student')` | the caller's own shifts, rotation, shift settings, Sunday check, Today banner | `shifts_student`, `patterns_student`, `profiles` self |
| `requireRole('admin')` + links scope (004's `getStudentCards`) | status of the Admin's actively linked students | `shifts_admin_read`, `is_admin_of` |
| `requireAdminOf(studentId)` (001) | 003's Plan bars and clash checks (unchanged) | `is_admin_of` |
| `CRON_SECRET` (as 002's purge) | the daily rotation top-up | server connection; no user |

Shift writes take `student_id` from the guard; a shift id from the client is matched with `where: { id, studentId: me.id }`, so another student's id is `shift_not_found`.
