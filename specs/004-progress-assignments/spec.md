# Feature Specification: Completion, Assignments and Progress

**Feature Branch**: `004-progress-assignments`
**Created**: 2026-11-20
**Status**: Implemented
**Screens**: `10-Lesson.png`, `04-Today.png`, `05-Courses.png`, `06-Progress.png`, Admin `16-AdminStudents.png`

## Clarifications

### Session 2026-11-22
- Q: Does a night of study count on the student's local calendar date or on the date their shift started? → A: The local calendar date, split at the student's local midnight; shifts play no part (FR-006).
- Q: Before 006 exists, what happens when a student submits or an Admin reviews or asks for a redo? → A: The notice is recorded now for 006 to deliver (one per student and lesson; a newer one replaces the older). The Admin's Students screen and the student's lesson screen update live through Realtime, which meets SC-002 without push (FR-009).
- Q: If a student starts a focus timer and closes the app for hours, how many minutes count? → A: Real elapsed time, capped at the chosen length (15 or 25 min); a timer that runs out while the app is closed ends at that moment (FR-007).
- Q: Can a student edit after submitting, and does "Needs redo" reopen a completed lesson? → A: Submitted and Reviewed are read-only for the student; "Needs redo" makes it editable again and the student resubmits (back to Submitted). Completion and progress don't change; the Admin can reopen the lesson separately (FR-002, FR-004).
- Q: Can an Admin change a review after choosing Reviewed or "Needs redo"? → A (decided after /speckit-analyze): Yes, between Reviewed and Needs redo, while the student hasn't resubmitted (FR-004).
- Q: Does a focus session stopped within seconds count? → A (decided after /speckit-analyze): No; a session under 1 minute is not counted (FR-007).
- Q: What is the lesson screen's "Notes" tab and who writes in it? → A: A thread for each student and lesson, shared by the student and their linked Admin; both can post and the tab shows the count. Review comments on a submission appear on the Assignment tab (FR-010).

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
2. **When** they tap Submit, **Then** status becomes Submitted, the Admin's Students screen shows it live, and a notice for the Admin is recorded (FR-009).
3. **Given** a submission, **When** the Admin comments and chooses Reviewed or "Needs redo", **Then** the student's lesson screen shows the new status and comment live, and a notice for the student is recorded (FR-009).
4. **Given** a submission marked "Needs redo", **When** the student edits it and taps Submit again, **Then** it returns to Submitted; the lesson's completion and course progress are unchanged throughout.
5. **Given** a lesson, **When** the student or their linked Admin posts on the lesson's Notes tab, **Then** both see it in that student's thread for the lesson and the tab shows "Notes · {count}"; other students never see it (FR-010).

### User Story 3 – See progress (Priority: P1)
**Acceptance Scenarios**
1. **Given** activity this month, **When** the student opens Progress, **Then** they see streak (current and best), time studied, lessons done vs last month, a month calendar shaded by study minutes, and a finish forecast per course.
2. **Given** a course with a course deadline for the student (003; the course target date only pre-fills it), **Then** the forecast says "On track · finishes ~{date}" or "Behind · ~{date} at this pace" using the last 14 days' pace.
3. **Given** the Admin's Students tab, **Then** each student card shows streak, minutes this week, lessons done this week, per-course progress bars and overdue count (weeks are the student's local Mon–Sun).

### User Story 4 – Focus timer logs study time (Priority: P2)
**Acceptance Scenarios**
1. **Given** a lesson, **When** the student starts "Focus 15" (or 25), **Then** a timer runs; on finish or stop, minutes are added to that lesson and the day.
2. **Given** the app is closed during a timer, **Then** elapsed time is still counted when reopened (timestamp-based), up to the chosen length: a "Focus 15" left running for 3 hours counts 15 minutes and ends 15 minutes after it started.
3. **Given** a running timer, **When** the student stops it before 1 minute has passed, **Then** nothing is counted.

### Edge Cases
- Streak day boundary is the student's local midnight. Study at 23:30 and 00:30 counts on two local dates, so a night shift that crosses midnight does not break a streak if study happened on either side of it.
- Offline completion → queued and synced, keeping the original timestamp. Built in 008; in 004 an offline attempt shows the offline error.
- Course with 0 published lessons → progress shows "—", not 0%.
- Undoing a lesson doesn't undo later ones, and a done lesson always stays open, even if an earlier lesson is no longer done (in-order unlocking, 002).

## Requirements

### Functional Requirements
- **FR-001**: Students MUST mark lessons complete and undo completion.
- **FR-002**: Admins MUST be able to mark complete or reopen on a student's behalf; actions are audited.
- **FR-003**: Submissions MUST support Markdown text and up to 5 images (resized ≤ 2 MB each).
- **FR-004**: Submission status: Draft → Submitted → Reviewed | Needs redo; Needs redo → Submitted when the student resubmits. The Admin may change a review between Reviewed and Needs redo until the student resubmits. The student can edit only in Draft and Needs redo; Submitted and Reviewed are read-only to them. Review status never changes the lesson's completion or course progress; only mark complete, undo and the Admin's reopen (FR-002) do.
- **FR-005**: Course progress = completed published lessons ÷ published lessons (computed in a SQL view).
- **FR-006**: Streak = consecutive local days with ≥ 1 completion or ≥ 10 study minutes. A local day is the student's calendar date in their time zone (split at local midnight); shifts (005) don't change which day study counts on.
- **FR-007**: Study minutes MUST come from focus timers plus each lesson's estimated minutes on completion when no timer was used. A focus session counts real elapsed time from its start, capped at the length the student chose (15 or 25 min); a session that reaches its length while the app is closed ends at start + length. A session under 1 minute is not counted.
- **FR-008**: Weekly goal (days per week) is set by the student; shown as "n of goal".
- **FR-009**: Notices from this feature (a submission for the Admin; Reviewed or "Needs redo" for the student) MUST be recorded when the action happens, in the form feature 006 delivers (push and inbox), as in 003 FR-012. 004 builds no push or inbox. There is one notice per student and lesson: a newer one replaces the earlier one, read or not, and shows as unread. Open screens MUST update through Realtime instead.
- **FR-010**: Each student and lesson has one Notes thread on the lesson screen, shared only by that student and their linked Admin; both MUST be able to read and post. The tab shows the comment count. Review comments on a submission belong to the submission and appear on the Assignment tab, not in Notes.

### Role access
- **Student**: sees and changes only their own progress, submissions (every status), focus sessions, weekly goal and Notes threads, on lessons they can read.
- **Admin**: sees only actively linked students. They see those students' progress, their study time as totals (minutes, streak; never individual focus sessions), their non-Draft submissions and images, and the Notes threads on lessons of the Admin's own courses. They review submissions, post in Notes, and mark done or reopen lessons in their own courses. They never see a Draft or its images, and never change a student's submission text.

### Key Entities
- **LessonProgress**: student, lesson, status, completed_at, completed_by, minutes_spent (the lesson's estimated minutes credited at completion when no timer was used; otherwise 0).
- **Submission**: student, lesson, body_md, attachments, status, submitted_at, reviewed_at.
- **Comment**: author, student (whose thread), target (lesson → Notes thread; submission → review comments), body.
- **StudySession**: student, lesson, started_at, ended_at, planned_minutes (15 or 25).

## Success Criteria
- **SC-001**: Mark complete updates Today, Courses and Progress in under 1 second (optimistic update).
- **SC-002**: An Admin with the Students screen open sees a new submission within 5 seconds (Realtime; push arrives with 006).
