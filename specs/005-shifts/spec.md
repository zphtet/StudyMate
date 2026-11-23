# Feature Specification: Shift Calendar and Availability

**Feature Branch**: `005-shifts`
**Created**: 2026-11-20
**Status**: Implemented
**Screens**: `07-Shifts.png`, `08-ShiftEdit.png`, `04-Today.png` (shift banner), Admin `22-AdminPlan.png`, `16-AdminStudents.png`

## Clarifications

### Session 2026-11-22
- Q: When a student changes or deletes a repeating rotation, what happens to the shifts it already generated? → A: From today on, the rotation's untouched future shifts are deleted and (on a change) generated again from the new pattern; past shifts and hand-edited days are kept (FR-007).
- Q: When a student changes a preset's times (e.g. Night to 21:00–06:00), where do the new times apply? → A: One set of preset times per student, used by Add shift and by every rotation (FR-002).
- Q: Before notifications exist (006), how does the Sunday 18:00 check "Next week's shifts — correct?" reach the student, and what does Confirm do? → A: An in-app card on Today and Shifts from Sunday 18:00 in the student's time until they tap Confirm or Edit, or the week starts; Confirm only dismisses it for that week. Push delivery comes with 006 (FR-009).
- Q: Can a shift be longer than 24 hours? → A: No; saving is blocked with "A shift can be at most 24 h" (FR-001).
- Q: Can a student have more than one rotation at a time? → A: No, one active rotation per student; saving a new one replaces the old one, with the FR-007 rules for its future shifts (FR-010).

## User Scenarios & Testing

### User Story 1 – Student adds a shift, including overnight (Priority: P1)
**Independent Test**: Add a night shift 22:00–07:00 on Fri; it shows on Fri and Sat in the calendar and as one record in the database.

**Acceptance Scenarios**
1. **Given** the Shifts tab, **When** the student taps "Add shift" and picks a preset (Day 09–18, Evening 14–23, Night 22–07, Off, Custom), **Then** start and end are pre-filled.
2. **Given** an end time earlier than the start time, **Then** the end date is set to the next day and shown with a "+1 day" badge and duration (e.g. "9 h · crosses midnight").
3. **Given** a saved night shift Fri 22:00 → Sat 07:00, **Then** the month calendar shows "22→" at the end of Fri and "→07" at the start of Sat, visually joined, including across a Sunday→Monday row break.
4. **Given** "Block sleep after this shift" is on (default for Night), **Then** a sleep block of the student's sleep length (default 8 h) follows the shift.

### User Story 2 – Repeating rotation (Priority: P2)
**Acceptance Scenarios**
1. **Given** a pattern (e.g. 3 day, 1 off, 2 night, 2 off) and a start date, **When** saved, **Then** shifts are generated 8 weeks ahead and extended weekly.
2. **Given** a generated day edited by hand, **Then** it stays as edited when the pattern regenerates.
3. **Given** Sunday 18:00 local, **Then** Today and Shifts show the card "Next week's shifts — correct?" with Confirm / Edit until the student answers or the week starts (FR-009).
4. **Given** a rotation that is changed or deleted, **Then** its untouched shifts that haven't started yet are removed (and, on a change, generated again from the new pattern); past and running shifts and hand-edited days stay.

### User Story 3 – Day timeline (Priority: P2)
**Acceptance Scenarios**
1. **Given** a selected day, **Then** a 24 h bar shows shift (including a continuation from the previous night), sleep, and free study windows, with a list of times.

### User Story 4 – Admin sees availability (Priority: P1)
**Acceptance Scenarios**
1. **Given** a linked student, **Then** the Admin's student card shows live status: "On night shift until 07:00", "Sleeping until 15:30" or "Free now".
2. **Given** the Plan week, **Then** each day shows the student's shift / sleep / free bar (feature 003).
3. **Given** a student with no shifts entered, **Then** status is "No shift info" and reminders use fixed times.

### Edge Cases
- Overlapping shifts → save blocked with "Overlaps your shift {time}".
- Shift longer than 24 h → save blocked with "A shift can be at most 24 h" (FR-001).
- Student changes timezone → shifts keep their absolute UTC instants; display updates.
- DST transitions (not in Japan, but supported) → duration computed from instants, not clock difference.
- An Off day is the whole local day, has no sleep block and counts as free time (it only records that the student isn't working).
- A rotation day that already has a hand-entered or edited shift (any type, Off included, from any rotation) is skipped when generating; the student's shift stays (FR-007).
- Deleting a generated shift makes that day Off, so the rotation doesn't fill it again.
- Changing preset times or the sleep length regenerates the active rotation's untouched shifts that haven't started yet (FR-002, FR-007).

## Requirements

### Functional Requirements
- **FR-001**: A shift MUST be one record with `start_at` and `end_at` (UTC); `end_at` > `start_at`; duration ≤ 24 h. An Off day only marks the whole local day, so it is 25 h on a daylight-saving fall-back day.
- **FR-002**: Shift types: day, evening, night, off, custom. Each student has one set of preset times (default Day 09–18, Evening 14–23, Night 22–07), which they can edit; Add shift and every rotation use it.
- **FR-003**: Sleep block after a shift is optional, length per student (default 8 h).
- **FR-004**: Free windows = waking hours (default 08:00–23:00 local, editable) minus shifts minus sleep blocks minus quiet hours.
- **FR-005**: Availability for any time range MUST be available as ordered segments {kind: shift | sleep | quiet | night | free, start, end}, where `night` is outside waking hours and `free` is what FR-004 leaves; used by Today, Plan, scheduling and notifications.
- **FR-006**: `status_now(student)` MUST return on_shift / sleeping / free / unknown with the next change time. on_shift = in a working shift; sleeping = in a sleep block or outside waking hours; free = anything else (quiet hours only hold notifications and don't change the status); unknown = no shifts entered (User Story 4, scenario 3), with no change time. The next change time is when the status next becomes different (none if that is more than 2 days away).
- **FR-007**: Rotations generate concrete shift rows tagged with `pattern_id`; manual edits set `overridden = true`. Changing or deleting a rotation removes its shifts that are not `overridden` and haven't started yet (a change then generates them again from today, skipping times already past); past and running shifts and `overridden` shifts are kept.
- **FR-008**: Admin can read but not edit a student's shifts.
- **FR-009**: For a student with at least one shift, from Sunday 18:00 in the student's time until the next week starts, Today and Shifts show "Next week's shifts — correct?" with Confirm (dismisses it for that week) and Edit (opens next week). It stays dismissed on every device. Feature 006 adds a push for the same moment.
- **FR-010**: A student has at most one active rotation. Saving a new rotation replaces the active one; FR-007 decides what happens to the old one's shifts.

### Permissions
| Action | Student | Admin |
| --- | --- | --- |
| Create / edit / delete own shifts and patterns | ✓ | – |
| Read shifts & availability | own | linked students |

### Key Entities
- **Shift**: student, type, start_at, end_at, sleep_block_min, pattern_id, overridden.
- **ShiftPattern**: student, sequence (e.g. `DDDONNOO`), start_date. Its times come from the student's preset times (FR-002).
- **Student settings** (on the profile): preset times, sleep length, waking hours, quiet hours.

## Success Criteria
- **SC-001**: Adding a night shift takes ≤ 3 taps from the Shifts tab.
- **SC-002**: Availability (busy segments and the free time between them) passes property tests for overnight, back-to-back and pattern-generated shifts.
- **SC-003**: No reminder is ever delivered inside a shift or sleep block (feature 006 integration test).
