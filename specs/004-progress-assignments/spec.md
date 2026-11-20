# Feature Specification: Completion, Assignments and Progress

**Feature Branch**: `004-progress-assignments`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: `10-Lesson.png`, `04-Today.png`, `05-Courses.png`, `06-Progress.png`, Admin `16-AdminStudents.png`

## User Scenarios & Testing

### User Story 1 – Mark a lesson complete (Priority: P1)
**Independent Test**: Open a lesson, mark complete; course % and streak update.

**Acceptance Scenarios**
1. **Given** an open lesson without "submit before complete", **When** the student taps "Mark complete", **Then** it is timestamped as done, course progress updates and the next lesson unlocks (if in-order).
2. **Given** "submit before complete" is on and no submission exists, **When** they tap "Mark complete", **Then** they are taken to the Assignment tab with a message.
3. **Given** a completed lesson, **When** the student taps "Undo", **Then** it returns to not-done and progress recalculates.
4. **Given** the Admin, **When** they mark a lesson done or reopen it for a student, **Then** the change is logged with who did it.

### User Story 2 – Write and submit an assignment (Priority: P1)
**Acceptance Scenarios**
1. **Given** a lesson with an assignment prompt, **When** the student writes Markdown and/or attaches photos, **Then** a draft autosaves.
2. **When** they tap Submit, **Then** status becomes Submitted and the Admin is notified.
3. **Given** a submission, **When** the Admin comments and chooses Reviewed or "Needs redo", **Then** the student is notified and sees the comment.

### User Story 3 – See progress (Priority: P1)
**Acceptance Scenarios**
1. **Given** activity this month, **When** the student opens Progress, **Then** they see streak (current and best), time studied, lessons done vs last month, a month calendar shaded by study minutes, and a finish forecast per course.
2. **Given** a course with a target date, **Then** the forecast says "On track · finishes ~{date}" or "Behind · ~{date} at this pace" using the last 14 days' pace.
3. **Given** the Admin's Students tab, **Then** each student card shows streak, minutes this week, lessons done, per-course progress bars and overdue count.

### User Story 4 – Focus timer logs study time (Priority: P2)
**Acceptance Scenarios**
1. **Given** a lesson, **When** the student starts "Focus 15" (or 25), **Then** a timer runs; on finish or stop, minutes are added to that lesson and the day.
2. **Given** the app is closed during a timer, **Then** elapsed time is still counted when reopened (timestamp-based).

### Edge Cases
- Streak day boundary uses the student's local midnight; a night shift crossing midnight does not break a streak if study happened on either side of it [NEEDS CLARIFICATION: count "study day" by local date or by shift-day?].
- Offline completion → queued and synced (feature 008), keeping the original timestamp.
- Course with 0 published lessons → progress shows "—", not 0%.

## Requirements

### Functional Requirements
- **FR-001**: Students MUST mark lessons complete and undo completion.
- **FR-002**: Admins MUST be able to mark complete or reopen on a student's behalf; actions are audited.
- **FR-003**: Submissions MUST support Markdown text and up to 5 images (resized ≤ 2 MB each).
- **FR-004**: Submission status: Draft → Submitted → Reviewed | Needs redo.
- **FR-005**: Course progress = completed published lessons ÷ published lessons (computed in a SQL view).
- **FR-006**: Streak = consecutive local days with ≥ 1 completion or ≥ 10 study minutes.
- **FR-007**: Study minutes MUST come from focus timers plus each lesson's estimated minutes on completion when no timer was used.
- **FR-008**: Weekly goal (days per week) is set by the student; shown as "n of goal".

### Key Entities
- **LessonProgress**: student, lesson, status, completed_at, completed_by, minutes_spent.
- **Submission**: student, lesson, body_md, attachments, status, reviewed_at.
- **Comment**: author, target (lesson or submission), body.
- **StudySession**: student, lesson, started_at, ended_at.

## Success Criteria
- **SC-001**: Mark complete updates Today, Courses and Progress in under 1 second (optimistic update).
- **SC-002**: Admin sees a new submission within 5 seconds (Realtime + push).
