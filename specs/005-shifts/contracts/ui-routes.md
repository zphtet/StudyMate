# Contract: UI routes and screens — 005

Rules for every screen: phone first (390×844), every tap target ≥ 44 px, theme tokens only, all text from the message files.

## Route layout

| Route | Change | Screenshot |
| --- | --- | --- |
| `/s/shifts` | replaces the placeholder: month calendar, day card, rotation and settings rows; `?month=YYYY-MM&day=YYYY-MM-DD` | `07-Shifts.png` |
| `/s/shifts/new?date=YYYY-MM-DD` | **new**: shift editor | `08-ShiftEdit.png` |
| `/s/shifts/[shiftId]` | **new**: shift editor for an existing shift, with Delete | `08-ShiftEdit.png` |
| `/s/shifts/rotation` | **new**: rotation editor | none (08 layout) |
| `/s/today` | + shift banner and the Sunday check card above 004's streak cards | `04-Today.png` (partial) |
| `/s/me` | + "Shift calendar" row | `11-Profile.png` (partial) |
| `/a/students` | + live status line on each student card | `16-AdminStudents.png` (partial) |
| `/a/plan` | unchanged; its shift / sleep / free bars come from 003 and now show real shifts (US4 scenario 2) | `22-AdminPlan.png` |

"Partial" means parts owned by other features are left out:
- 006: the bell, "Quiet hours", "My reminders", "Send a nudge", "Reminders";
- not in any spec: "active 2 h ago".

Intentional differences:
- **08-ShiftEdit.png "Every Friday"** is left out: the spec has no weekly repeat and FR-010 allows one rotation; a one-shift rotation covers it (research R11).
- **16-AdminStudents.png "Night shift tonight"** is the spec's live status instead: "On night shift until 07:00", "Sleeping until 15:30", "Free now", "No shift info" (US4 scenario 1, 3; research R8).

## Student screens

**Shifts** (`/s/shifts`, 07-Shifts.png)
- Header "Shifts" and **Add shift** (primary, opens `/s/shifts/new?date={selected day}`).
- Month navigation "‹ November 2026 ›" (`?month=` in the URL) and the legend (Day, Evening, Night, Custom; only types in this month).
- The Sunday check card above the calendar when due (see Today).
- `CalendarMonth` (003) with shift chips in each day (research R5):
  - "9–18" for a same-day shift; "22→" at the end of the start day and "→07" at the start of the next day, square where they meet, joined across the cell border and the Sunday→Monday row break; "Off" muted.
  - Today has the filled circle; the selected day is highlighted; arrow keys move between days (003).
  - Each day's accessible name ends with its shifts, e.g. "Friday 20 November, Night shift 22:00 to Saturday 07:00".
- **Day card** for the selected day (default today): "Today · Fri 20 Nov" (or the date) and **Edit** (the day's shift, or a new one for that day).
  - `DayBar` (003) for the day, with the scale 00 / 06 / 12 / 18 / 24.
  - The list (research R6): swatch, time range, label: "Night shift (from Thu)", "Sleep, auto 8 h", "Free to study" (success colour), "22:00 → Sat 07:00 · Night shift".
  - No shifts that day: "No shift. Free 08:00–23:00" from waking hours.
- Below: a **My rotation** row ("DDDONNOO from 2 Nov" or "Set up a rotation") → `/s/shifts/rotation`, and a **Shift settings** row → settings sheet.
- Empty state (no shifts at all): "Add your shifts so your admin plans around them." with **Add shift** and **Set up a rotation**.

**Shift editor** (`/s/shifts/new`, `/s/shifts/[shiftId]`, 08-ShiftEdit.png)
- Top bar: **Cancel**, "Shift · Fri 20 Nov", **Save**. The bottom **Save shift** button does the same.
- **Shift type**: five tiles (radio group): Day, Evening, Night, Off, Custom, each with its colour swatch. Choosing Day / Evening / Night fills the times from the presets; Custom keeps the times; Off hides the times and the sleep box.
- **Starts** / **Ends** time fields with the date below; Ends shows a "+1 day" badge when it ends the next day (US1 scenario 2).
- A 48 h strip "Fri 00:00 · midnight · Sat 24:00" with the shift drawn on it, and the line "9 h · crosses midnight, ends the next morning" (or "9 h").
- **Repeat**: **Just this day** / **My rotation** ("Fill future weeks from my pattern; edited days stay as I set them"). With My rotation, **Save** doesn't store the shift; it opens `/s/shifts/rotation?start={date}&type={D|E|N|O}` and the rotation generates the day. My rotation is disabled for Custom (no rotation letter; research R11).
- **Block sleep after this shift** (checkbox card, on by default for Night): "No reminders until 15:30 Sat (8 h)".
- Errors under the form: "Overlaps your shift Fri 22:00–07:00", "A shift can be at most 24 h".
- Existing shift: **Delete shift** (destructive, with confirm); for a generated shift the confirm says "This day becomes Off; your rotation won't fill it again."
- Mobile: full screen; ≥ 1024 px: the same form in a centred column.

**Rotation editor** (`/s/shifts/rotation`)
- "My rotation". The pattern as a row of letter tiles (D, E, N, O with their colours); buttons **+ Day**, **+ Evening**, **+ Night**, **+ Off** append; tapping a tile removes it; up to 28 days.
- **Starts on** date (default: the next Monday, or `?start=` when opened from the shift editor, which also puts `?type=` as the first letter of a new pattern).
- Preview: the next 14 days with the shift each day would get, from the presets.
- **Save rotation**; after saving, a note when days were skipped: "Kept your own shifts on 3 days." **Delete rotation** (destructive, with confirm: "Future shifts from this rotation will be removed. Days you edited stay.").

**Shift settings** (bottom sheet from the Shifts screen)
- Preset times: Day, Evening, Night, each start and end.
- Sleep after a shift: 4–12 h in 30 min steps.
- Waking hours: from / to.
- **Save**; a note when a rotation is active: "Your rotation's future shifts will use the new times."

**Today** (04-Today.png)
- **Shift banner** (dark card, moon icon for Night, sun for Day / Evening / Custom), above the streak cards (research R7):
  - "Night shift tonight · 22:00–07:00" / "{Type} shift today · 09:00–18:00" / "On shift until 07:00";
  - "Good window to study now: about 90 min free" / "Free again at 15:30".
- **Sunday check card** when due (FR-009): "Next week's shifts — correct?" with **Confirm** (outline) and **Edit** (primary → `/s/shifts?month=…&day={next Monday}`). Both dismiss it for that week.

**Me** (11-Profile.png): a **Shift calendar** row in Study, above Weekly goal, linking to `/s/shifts`, value "{n} shifts this week" / "No shifts this week".

## Admin screens

**Students** (`/a/students`): under each student's name (research R8):
- on_shift: "On night shift until 07:00" (type in words), sleeping: "Sleeping until 15:30", free: "Free now", unknown: "No shift info".
- The time is the student's local time; when the Admin's zone differs, " · 05:30 yours" follows (constitution IV). A change more than a day away also shows the weekday.
- Refreshes when the time shown passes and on focus.

## Shared components and tokens

| Component / token | Path | Used by |
| --- | --- | --- |
| `ShiftChip` | `features/shifts/components/shift-chip.tsx` | calendar, day list |
| `ShiftTypePicker` | `features/shifts/components/shift-type-picker.tsx` | editor, rotation editor |
| `DayBar`, `DayBarScale` | `components/shared/day-bar.tsx` (003) | day card |
| `CalendarMonth` | `components/shared/calendar-month.tsx` (003) | Shifts |
| `--shift-day`, `--shift-evening`, `--shift-night`, `--shift-custom` (+ `-foreground`) | `app/globals.css` | chips, tiles, legend; covered by the contrast test |

Message namespaces: `shifts` (screen, chips, day list, empty state), `shiftEditor`, `rotation`, `shiftSettings`, `shiftBanner`, `weekCheck`, `availabilityStatus` (admin card), the new `errors.*` and `validation.*` keys (contracts/server-actions.md). All three languages: `en`, `my`, `ja`.
