# Feature Specification: Assigning Courses and Deadlines

**Feature Branch**: `003-assign-deadlines`
**Created**: 2026-11-20
**Status**: Implemented
**Input**: User description: "003 assign-deadlines" (completes the 2026-11-20 draft of this spec)
**Screens**: `23-AdminAssign.png`, `22-AdminPlan.png`, Student `04-Today.png`, `05-Courses.png`, `09-Course.png`

## Clarifications

### Session 2026-11-21
- Q: Before 006 exists, what happens to "Notify students now", deadline-change notices and default reminders? → A: They are recorded now; 006 delivers them (FR-012).
- Q: How does the course's target date (002) relate to each student's course deadline? → A: It pre-fills each student's Due field in the Assign sheet (23:59 in that student's time) and can be changed there; after that only the student's own course deadline counts, and changing the target date later moves no one.
- Q: Should a deadline time inside the student's shift or sleep also be flagged while picking it in the Assign sheet or the deadline sheet, not only on the Plan? → A (default, decided without asking): Yes, with the same message and one-tap move as the Plan.
- Q: Can a lesson deadline be later than the course deadline? → A (default, decided without asking): Yes; the sheet notes "Later than the course deadline" but allows it.
- Q: When a student changes time zone, do deadlines keep their exact moment or their local clock time? → A (default, decided without asking): Their exact moment; the local time shown changes.
- Q: If the Admin changes the same deadline several times, how many notices does the student get? → A (default, decided without asking; wording aligned after /speckit-analyze): One per item; a newer notice replaces the earlier one about the same lesson or course, read or not, and shows as unread.
- Q: Where does "Move to …" put a clashing deadline, and do quiet hours count as busy on the Plan? → A (decided after /speckit-analyze): At the first free time after the clash that leaves room for the lesson (its estimated minutes, at least 1 hour), rounded up to a whole hour in the student's time; quiet hours only delay notifications (006) and don't count on the Plan.
- Q: Can an Admin set a deadline on a Draft lesson? → A (decided after /speckit-analyze): No; only Published lessons, because Draft lessons don't appear on the Plan or to students (FR-006).

## User Scenarios & Testing

### User Story 1 – Admin assigns a course to one or many students (Priority: P1)
An Admin opens one of their Active courses, taps Assign, ticks any of their linked students and gives each one an optional deadline in that student's own time. The course then appears for those students.

**Why this priority**: Nothing reaches a student until it is assigned; every other story depends on assignments.

**Independent Test**: Assign one course to two linked students in different time zones with different deadlines; each sees the course with their own due date.

**Acceptance Scenarios**
1. **Given** an Active course, **When** the Admin taps Assign, **Then** a sheet lists all their linked students (name and the city of their time zone) with a checkbox each; every selected student gets a "Due" field that starts at the course's target date (23:59 in that student's time) or, when the course has none, "No deadline".
2. **Given** a selected student, **When** the Admin picks a due date and time, **Then** it is entered in that student's time zone, with the Admin's own time shown beside it when the zones differ; a time inside the student's shift or sleep block gets the same warning and one-tap move as the Plan (US4 scenario 2).
3. **Given** students are selected, **When** the Admin taps "Assign to N students", **Then** each one gets the course with their own deadline (or none) and it appears in their Courses list.
4. **Given** a course already assigned to a student, **When** the sheet opens, **Then** that student is already ticked with their current deadline, and saving updates the assignment instead of duplicating it.
5. **Given** an assigned student is unticked, **When** the Admin saves and confirms, **Then** the course is unassigned for that student (see Edge Cases).
6. **Given** "Add default reminders" is on (default on), **When** assigned, **Then** the default reminder set (feature 006 FR-008) is created for each selected student who does not already have it.
7. **Given** "Notify students now" is on (default off), **When** assigned, **Then** each newly assigned student is notified "New course: {course}" (FR-012).
8. **Given** the sheet's "Unlock lessons in order" switch, **Then** it shows and changes the course's own setting (002 FR-004), and the sheet says it applies to every student of the course.

### User Story 2 – Admin sets and changes deadlines (Priority: P1)
The Admin sets one deadline for a whole course and, where needed, a different deadline for a single lesson, per student. From the Plan they add, move or remove deadlines.

**Why this priority**: Deadlines turn a course into a plan; the student's statuses, the Plan and reminders (006) all depend on them.

**Independent Test**: Set a course deadline and one lesson deadline for a student; on the Plan, the lesson card sits on its own date and one card for the course sits on the course date. Drag the lesson card to another day; it keeps its time of day and the change is saved. (What the student sees is tested in US3.)

**Acceptance Scenarios**
1. **Given** an assignment with a course deadline, **Then** every lesson without its own deadline is due at the course deadline.
2. **Given** the Admin sets a lesson deadline for a student, **Then** it overrides the course deadline for that lesson and that student only.
3. **Given** the Plan tab, **When** the Admin taps "+ Deadline", **Then** they choose one of the selected student's assigned courses, then "Whole course" or one lesson, then a date and time (student's time first, Admin's beside it, with the shift/sleep warning of US4 scenario 2); saving creates or replaces that deadline.
4. **Given** a deadline card on the Plan week view, **When** the Admin long-presses and drags it to another day, **Then** it moves to that day at the same time of day in the student's time zone, and the student is notified.
5. **Given** a deadline card, **When** the Admin taps it, **Then** they can change its date and time or remove it; removing a lesson deadline makes that lesson fall back to the course deadline.
6. **Given** a deadline is set, changed or removed after assignment, **Then** the student is notified "{lesson or course} is now due {date, time}" or "{lesson or course} no longer has a deadline" (FR-012).

### User Story 3 – Student sees what is due and what is late (Priority: P1)
The student sees, on Today, the course screen and the Courses list, what is overdue, what is due soon and what comes later.

**Why this priority**: This is the student-facing value of deadlines: knowing what to do next.

**Independent Test**: With three lessons (one past due, one due later today, one next week), check the chips, the Today sections and the Courses card count for a student in Tokyo and one in Yangon.

**Acceptance Scenarios**
1. **Given** deadlines exist, **When** the student opens Today, **Then** they see "Overdue · N" (oldest first) and then "Due today" (earliest first); each item shows lesson, course, minutes and a chip ("2 days late", "by 21:00"). Streak and weekly-goal cards and the "Continue" card arrive with 004; the shift banner arrives with 005.
2. **Given** a lesson past its effective deadline and not complete, **Then** it shows red "N days late" (N = calendar days in the student's time zone; "Overdue" when it was due earlier the same day) wherever it appears.
3. **Given** a lesson due within 24 h and not complete, **Then** it is amber: "Due today" with the time ("21:00 tonight") or "Due tomorrow" with the time. Complete → green "Done". Due later → grey "Due {date}". No effective deadline → no due chip (Open/Locked as in 002).
4. **Given** the course screen, **Then** the header reads "Assigned by {admin} · finish by {course deadline}" (the "finish by" part only when there is a course deadline), and each lesson row shows its chip and a detail line ("was due Wed 18 Nov", "21:00 tonight", "unlocks after 15").
5. **Given** the Courses list, **Then** each course card shows "due {date}" or "no deadline" and, when any lesson is overdue, a red "· N overdue". Progress bars and "12 of 20" counts arrive with 004.

### User Story 4 – Admin sees the plan per student (Priority: P2)
The Admin picks a student and a week and sees, day by day, when that student works, sleeps and is free, together with that day's deadlines, so clashes are easy to spot and fix.

**Why this priority**: It prevents deadlines that land during shifts or sleep, but assigning and tracking deadlines work without it.

**Independent Test**: Add shifts for a student directly in test data, open the Plan week view; each day shows the availability bar and its deadlines, and a deadline inside a shift is flagged with a move suggestion.

**Acceptance Scenarios**
1. **Given** the Plan tab, **When** a student chip and a week (Mon–Sun, arrows to change) are selected, **Then** each day shows the student's availability bar (shift / sleep / free over 00–24 in the student's time) and that day's deadlines with status; today is highlighted with a "now" marker.
2. **Given** a deadline that is not complete, is in the future and falls inside the student's shift or sleep block, **Then** its card says "{name} is on shift then" or "{name} is asleep then" with a one-tap "Move to {day time}" that moves it to the first free time after the clash that leaves room for the lesson (FR-009), and notifies as in US2 scenario 6.
3. **Given** "Month" is selected, **Then** a month calendar shows the number of deadlines per day (late ones in red); tapping a day opens that week.
4. **Given** a course deadline, **Then** the Plan shows it as one card for the course, not one card per lesson.
5. **Given** a student who has recorded no shifts yet, **Then** the bar shows only what their availability settings imply and no shift clash is flagged.

### Edge Cases
- Student in a different time zone from the Admin → deadlines are entered in the student's time with the Admin's time shown beside it.
- A date picked without a time → due at 23:59 in the student's time zone.
- Deadline in the past when assigning or editing → warn "Already overdue", allow.
- Local time that does not exist on a daylight-saving change day → saved as the next valid local time and shown that way; moving a deadline across a daylight-saving change keeps the same local clock time.
- Student changes time zone → deadlines keep their exact moment; the local time shown to them changes.
- Lesson deadline later than the course deadline → allowed; the sheet notes "Later than the course deadline".
- Unassigning a course → progress, submissions and lesson deadlines are kept; the course disappears from the student's screens and the Admin's Plan; reassigning restores them, with the course deadline chosen in the sheet.
- A lesson with a deadline is unpublished or deleted → its deadline is hidden and not counted while the lesson is hidden, comes back if the lesson is published again or restored within 30 days (002 FR-006), and is removed when the lesson is purged.
- Course archived or deleted → its deadlines stop counting and leave Today, the Courses counts and the Plan.
- Course deadline passes with many lessons left → each remaining lesson is overdue; each Today section shows at most 5 items, then "Show all (N)".
- Completed items on the Plan cannot be dragged.
- Two edits to the same deadline at once → the last save wins.

## Requirements

### Functional Requirements
- **FR-001**: Admins MUST be able to assign their own Active courses to any number of their linked students in one action; Draft and Archived courses cannot be assigned.
- **FR-002**: Each (course, student) pair MUST have at most one assignment, with an optional course deadline; assigning again updates it. The course's target date (002) only pre-fills the Due field in the Assign sheet; it is never a deadline itself, and changing it later changes no student's deadline.
- **FR-003**: Each (lesson, student) pair MAY have its own deadline that overrides the course deadline, only for Published lessons of a course actively assigned to that student.
- **FR-004**: Effective deadline = lesson deadline, else course deadline, else none. The same definition MUST be used everywhere (student screens, Plan, reminders in 006).
- **FR-005**: A lesson's deadline status MUST be derived, never stored, using the first that applies: done (complete) → overdue (now is past the effective deadline) → due soon (due within 24 h) → locked (002) → upcoming (later deadline) → none. Colours: done green, overdue red, due soon amber, locked and upcoming grey.
- **FR-006**: Only Published, non-deleted lessons of Active courses with an active assignment MUST count toward statuses, Today, overdue counts and the Plan.
- **FR-007**: Unassigning MUST keep the student's progress, submissions and lesson deadlines and hide the course from the student; reassigning MUST restore them.
- **FR-008**: Deadlines MUST be stored as exact moments in time (UTC) and shown in the viewer's time zone. Wherever an Admin enters or sees a student's deadline, the student's local time comes first and the Admin's local time is shown beside it when the zones differ.
- **FR-009**: The Plan MUST show, for the selected student and week, the availability bar (shift / sleep / free) using the shift and sleep rules of feature 005 (time outside the student's waking hours counts as sleep; quiet hours, which only delay notifications in 006, are not shown and don't count). It MUST flag future, incomplete deadlines that fall inside a shift or sleep block, with a one-tap move to the first free time after the clash that leaves room for the lesson (its estimated minutes, at least 1 hour; 1 hour for a course deadline), rounded up to a whole hour in the student's time and searched up to 7 days ahead; no move is offered when nothing fits. The same warning and one-tap move MUST appear when an Admin picks a deadline time in the Assign sheet or the deadline sheet.
- **FR-010**: The Plan MUST offer a Month view with the number of deadlines per day.
- **FR-011**: Every deadline change possible by dragging MUST also be possible by tapping (edit sheet) and by keyboard.
- **FR-012**: Notifications from this feature ("Notify students now"; a deadline set, changed or removed after assignment) MUST be recorded for the student when the action happens, in the form feature 006 delivers (push and inbox). 003 builds no delivery; students see these notifications once 006 ships. Likewise, the reminder rules from FR-013 are saved now and start firing with 006. There is one notice per student and lesson or course: a newer one replaces the earlier one, read or not, and shows as unread, so repeated moves produce one notice.
- **FR-013**: "Add default reminders" MUST create the default rule set of 006 FR-008 at most once per student.
- **FR-014**: Text that refers to a student MUST use their name, not a pronoun ("May is on shift then", "May gets a notification"), because the app stores no gender.
- **FR-015**: All new text MUST exist in English, Burmese and Japanese.

### Permissions
| Action | Student | Admin |
| --- | --- | --- |
| Assign or unassign a course | – | ✓ own Active courses, own linked students |
| Set, move or remove course and lesson deadlines | – | ✓ own courses, own linked students |
| Turn on default reminders, notify students on assign | – | ✓ own linked students |
| See assignments, deadlines and statuses | ✓ own | ✓ own linked students |
| See the Plan (availability and deadlines) | – | ✓ own linked students |

### Key Entities
- **Course assignment**: a course given to one student by their Admin, with an optional course deadline and a state (active or removed); one per course and student.
- **Lesson deadline**: one student's own deadline for one lesson, and who set it.
- Uses from other features: lesson completion (004), shifts and availability (005), reminder rules and notifications (006).

## Success Criteria

### Measurable Outcomes
- **SC-001**: An Admin can assign a course to 2 students with deadlines in under 30 seconds on a phone.
- **SC-002**: Overdue, due-soon and upcoming statuses are correct in 100% of unit tests across Tokyo, Yangon, UTC and a daylight-saving time zone, including around local midnight and daylight-saving changes.
- **SC-003**: No student or Admin can see or change assignments or deadlines outside their own links (guard and access-rule tests).
- **SC-004**: An Admin can move a deadline with one drag or two taps, and the student sees the new date the next time their screen loads.

## Assumptions
- Linking from 001 (join with a code, Admin approves) provides the linked students; tests create links directly.
- Lesson completion is written by 004; until then "Done" comes from completion records created directly in tests, as in 002 FR-010.
- Students record shifts in 005; the Plan reads availability through the shared availability rules, so it works now and fills in once shifts exist. Tests create shifts directly.
- Notifications and reminder rules are recorded in 003 and delivered by 006 (FR-012); until 006 ships, "Notify students now", deadline-change notices and default reminders have no visible effect for students.
- A student has one Admin (001).
- The "Unlock lessons in order" switch in the Assign sheet is the course's setting, not a per-student one.
- The Plan opens on the first linked student by name and the current week; its days are the student's local days.
- Out of scope: Today's streak, weekly-goal and Continue cards, the course progress card and Courses progress bars (004); the night-shift banner (005); delivery channels, the inbox screen and rule editing (006).
