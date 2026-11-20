# Feature Specification: Assigning Courses and Deadlines

**Feature Branch**: `003-assign-deadlines`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: `23-AdminAssign.png`, `22-AdminPlan.png`, Student `04-Today.png`, `09-Course.png`

## User Scenarios & Testing

### User Story 1 – Assign a course to one or many students (Priority: P1)
**Independent Test**: Assign one course to two linked students with different deadlines; each sees it with their own due date.

**Acceptance Scenarios**
1. **Given** an Active course, **When** the Admin opens Assign and selects any linked students (multi-select), **Then** each selected student can get their own optional due date and time.
2. **Given** "Add default reminders" is on, **When** assigned, **Then** the default rule set (feature 006) is created for those students.
3. **Given** "Notify students now" is on, **When** assigned, **Then** each student receives a push "New course: {course}".
4. **Given** a course already assigned to a student, **When** assigned again, **Then** the existing assignment is updated, not duplicated.

### User Story 2 – Set or change deadlines for a course or a single lesson (Priority: P1)
**Acceptance Scenarios**
1. **Given** an assignment, **When** the Admin sets a course deadline, **Then** it applies to every lesson without its own deadline.
2. **Given** a lesson, **When** the Admin sets a lesson deadline, **Then** it overrides the course deadline for that lesson.
3. **Given** the Plan week view, **When** the Admin drags a deadline to another day, **Then** the due date changes and the student is notified.
4. **Given** a deadline that falls inside the student's shift or sleep block (feature 005), **When** shown on Plan, **Then** it is flagged "She is on shift then" with a one-tap move to her next free time.

### User Story 3 – Student sees what is due and what is late (Priority: P1)
**Acceptance Scenarios**
1. **Given** deadlines exist, **When** the student opens Today, **Then** items show in order: Overdue, Due today, Continue.
2. **Given** a lesson past its deadline and not complete, **Then** it is red "N days late" everywhere it appears, and the Courses tab shows a red count.
3. **Given** due within 24 h, **Then** amber; done → green; otherwise grey.

### User Story 4 – Admin sees the plan per student (Priority: P2)
**Acceptance Scenarios**
1. **Given** the Plan tab, **When** a student and week are selected, **Then** each day shows the availability bar (shift / sleep / free) and that day's deadlines with status.
2. **Given** "Month" is selected, **Then** a month calendar shows deadline counts per day.

### Edge Cases
- Student in a different timezone from the Admin → deadlines are entered in the student's time with the admin's time shown beside it.
- Deadline in the past when assigning → warn, allow ("already overdue").
- Unassigning a course → progress kept, course hidden from student; reassigning restores it.
- Lesson deleted that had a deadline → deadline removed.

## Requirements

### Functional Requirements
- **FR-001**: Admins MUST assign a course to any number of their linked students in one action.
- **FR-002**: Each (course, student) assignment MUST support an optional due date-time.
- **FR-003**: Each (lesson, student) MAY have its own due date-time that overrides the course deadline.
- **FR-004**: Effective deadline = lesson deadline ?? course deadline ?? none.
- **FR-005**: Lesson status MUST be derived: done, overdue (now > due and not done), due-soon (due within 24 h), upcoming, locked.
- **FR-006**: Changing a deadline MUST notify the student (feature 006).
- **FR-007**: Plan view MUST overlay deadlines on the student's availability from feature 005 and flag clashes.
- **FR-008**: All deadlines MUST be stored as UTC and displayed in the viewer's timezone, with the student's time shown first to Admins.

### Key Entities
- **CourseAssignment**: course, student, assigned_by, due_at, status (active / removed).
- **LessonDeadline**: lesson, student, due_at.

## Success Criteria
- **SC-001**: Assigning a course to 2 students with deadlines takes under 30 seconds.
- **SC-002**: Overdue status is correct across timezones in 100% of unit tests (Tokyo, Yangon, UTC, DST zone).
