# Feature Specification: Courses and Lessons

**Feature Branch**: `002-courses-lessons`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: `17-AdminCourses.png`, `18-AdminCourse.png`, `19-AdminCourseForm.png`, `20-AdminLessonEdit.png`, `21-AdminDelete.png`, Student view `05-Courses.png`, `09-Course.png`, `10-Lesson.png`

## User Scenarios & Testing

### User Story 1 – Admin creates a course (Priority: P1)
**Independent Test**: Create a course, see it in the Courses list as Draft.

**Acceptance Scenarios**
1. **Given** an Admin on Courses, **When** they tap "New course", fill title, icon character, colour, description, target date, level tag and save as Draft, **Then** the course appears under Drafts and is invisible to students.
2. **Given** "Copy existing course" is chosen, **When** saved, **Then** all sections and lessons are copied as Drafts with no assignments or progress.
3. **Given** a Draft course, **When** status is set to Active, **Then** it can be assigned (feature 003).

### User Story 2 – Admin builds lessons inside sections (Priority: P1)
**Independent Test**: Add 2 sections and 3 lessons, reorder, publish; preview matches student view.

**Acceptance Scenarios**
1. **Given** a course, **When** the Admin taps "Add lesson", **Then** the lesson editor opens with title, minutes, section, unlock rule, Markdown body, attachments and assignment prompt.
2. **Given** the editor, **When** the Admin switches Write → Preview, **Then** the Markdown renders exactly as the student will see it (shared component).
3. **Given** a lesson list, **When** the Admin drags ⋮⋮, **Then** lessons reorder or move to another section and the order persists.
4. **Given** a Draft lesson, **When** Published, **Then** linked students assigned to the course see it.
5. **Given** an editor with unsaved changes, **When** 3 seconds pass without typing, **Then** the draft autosaves and shows "Saved hh:mm".

### User Story 3 – Admin edits, archives and deletes safely (Priority: P2)
**Acceptance Scenarios**
1. **Given** a lesson with student work, **When** the Admin chooses Delete, **Then** a confirmation lists affected students and offers "Unpublish instead".
2. **Given** a course, **When** Delete is chosen, **Then** the Admin must type the course name to confirm.
3. **Given** a deleted item, **When** within 30 days, **Then** it can be restored from "Recently deleted".
4. **Given** an Active course, **When** Archived, **Then** students keep read-only access to completed lessons and it leaves their active list.

### User Story 4 – Student reads lessons (Priority: P1)
**Acceptance Scenarios**
1. **Given** an assigned course, **When** the student opens it, **Then** they see sections, lesson status (done, overdue, due today, upcoming, locked) and course progress.
2. **Given** "unlock in order" is on, **When** lesson N is not complete, **Then** lesson N+1 shows Locked and cannot be opened.
3. **Given** a lesson, **When** opened, **Then** Markdown (headings, lists, tables, images, code, audio, YouTube links) renders with Japanese and Burmese text displayed correctly.

### User Story 5 – Student creates personal courses (Priority: P3)
Students can create their own courses ("Mine"), visible only to them and their admin (read-only for the admin).

### Edge Cases
- Very long Markdown (> 50 KB) → still renders; editor warns above 200 KB.
- Image upload > 10 MB → rejected with message; images are resized client-side.
- Reordering while another device edits → last write wins per lesson; order conflicts resolved by server `position` recompute.
- Unsafe HTML in Markdown → stripped (no raw HTML, sanitize).

## Requirements

### Functional Requirements
- **FR-001**: Admins MUST create, edit, duplicate, archive, delete and restore courses.
- **FR-002**: Courses MUST have title, icon character, colour, description, target date (optional), level tag (optional), unlock-in-order flag, status (Draft/Active/Archived).
- **FR-003**: Courses MUST contain optional sections; lessons MUST belong to a course and optionally a section, with an explicit position.
- **FR-004**: Lessons MUST have title, estimated minutes, Markdown body, attachments (file or link), assignment prompt (optional), "submit before complete" flag, unlock rule (none / after previous / on date), status (Draft/Published).
- **FR-005**: Only Published lessons of Active courses MUST be visible to assigned students.
- **FR-006**: Deletes MUST be soft (`deleted_at`) and purged after 30 days.
- **FR-007**: Markdown MUST be sanitized; raw HTML disallowed.
- **FR-008**: Files MUST be stored in Supabase Storage with access limited to the admin and assigned students.
- **FR-009**: Course list MUST support search and filters Active / Drafts / Archived, showing lesson count, assigned students and average progress.

### Permissions
| Action | Student | Admin |
| --- | --- | --- |
| Create/edit/delete admin courses & lessons | – | ✓ own |
| Read published lessons of assigned courses | ✓ | ✓ |
| Create personal course | ✓ | read-only |

### Key Entities
- **Course**, **CourseSection**, **Lesson**, **LessonResource** (file/link/audio).

## Success Criteria
- **SC-001**: An Admin can create a course with 5 lessons in under 10 minutes on a phone.
- **SC-002**: Preview and student view render identical HTML for the same Markdown (snapshot test).
- **SC-003**: Zero students can read Draft or deleted content (guard tests and RLS tests).
