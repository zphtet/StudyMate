# Feature Specification: Courses and Lessons

**Feature Branch**: `002-courses-lessons`
**Created**: 2026-11-20
**Status**: Implemented
**Screens**: `17-AdminCourses.png`, `18-AdminCourse.png`, `19-AdminCourseForm.png`, `20-AdminLessonEdit.png`, `21-AdminDelete.png`, Student view `05-Courses.png`, `09-Course.png`, `10-Lesson.png`

## Clarifications

### Session 2026-11-21
- Q: Should 002's student course screen show full status chips and the progress card, or only order and Locked/Open? → A: Only sections, lesson order, minutes and Open/Locked; 003 adds due/overdue chips, 004 adds Done and the progress card.
- Q: When an admin edits a Published lesson, do students see changes on autosave or only after re-publishing? → A: On autosave; every lesson (Draft or Published) autosaves the same way and saved edits to a Published lesson are live immediately.
- Q: Should 002 include the "Students can add personal notes" switch from screenshot 19? → A: Yes, as a stored course setting only (default on); it has no effect until a notes feature is specified.
- Q: How does the course "Unlock lessons in order" switch interact with each lesson's own unlock rule? → A: The switch is the default for new lessons; changing it rewrites every lesson's rule (on → "after previous", off → "none"; "on date" lessons keep their date). After that, each lesson's own rule alone decides locking.
- Q: What can students do with personal courses ("Mine", US5)? → A: Out of scope for 002; moved to a later feature.
- Q: Do YouTube links render as an embedded player or a plain link? → A (default accepted): A YouTube URL alone on its own line renders as an embedded player (privacy-enhanced domain); inline YouTube links stay plain links; offline, the player falls back to a plain link.
- Q: Does "Copy existing course" copy attachments? → A (default accepted): Yes; files are duplicated into the new course's storage folder.
- Q: After archiving, can students see lessons they hadn't completed? → A (default accepted): No; only completed lessons stay readable (read-only), under an "Archived" group in their course list.
- Q: Does restoring a deleted lesson or course within 30 days bring back students' work? → A (default accepted): Yes; soft delete keeps progress and submissions until the purge, so restore brings everything back.

## User Scenarios & Testing

### User Story 1 – Admin creates a course (Priority: P1)
**Independent Test**: Create a course, see it in the Courses list as Draft.

**Acceptance Scenarios**
1. **Given** an Admin on Courses, **When** they tap "New course", fill title, icon character, colour, description, target date, level tag and save as Draft, **Then** the course appears under Drafts and is invisible to students.
2. **Given** "Copy existing course" is chosen, **When** saved, **Then** all sections, lessons and attachments are copied as Drafts (attachment files duplicated into the new course's storage folder) with no assignments or progress.
3. **Given** a Draft course, **When** status is set to Active, **Then** it can be assigned (feature 003).

### User Story 2 – Admin builds lessons inside sections (Priority: P1)
**Independent Test**: Add 2 sections and 3 lessons, reorder, publish; preview matches student view.

**Acceptance Scenarios**
1. **Given** a course, **When** the Admin taps "Add lesson", **Then** the lesson editor opens with title, minutes, section, unlock rule, Markdown body, attachments and assignment prompt.
2. **Given** the editor, **When** the Admin switches Write → Preview, **Then** the Markdown renders exactly as the student will see it (shared component).
3. **Given** a lesson list, **When** the Admin drags ⋮⋮, **Then** lessons reorder or move to another section and the order persists.
4. **Given** a Draft lesson, **When** Published, **Then** linked students assigned to the course see it.
5. **Given** an editor with unsaved changes on a Draft or Published lesson, **When** 3 seconds pass without typing, **Then** the lesson autosaves and shows "Saved hh:mm"; for a Published lesson the saved changes are visible to students immediately (no separate working copy).

### User Story 3 – Admin edits, archives and deletes safely (Priority: P2)
**Acceptance Scenarios**
1. **Given** a lesson with student work, **When** the Admin chooses Delete, **Then** a confirmation lists affected students and offers "Unpublish instead".
2. **Given** a course, **When** Delete is chosen, **Then** the Admin must type the course name to confirm.
3. **Given** a deleted item, **When** within 30 days, **Then** it can be restored from "Recently deleted", together with its lessons and students' progress and submissions as they were.
4. **Given** an Active course, **When** Archived, **Then** it leaves students' active list and appears under an "Archived" group, where completed lessons stay readable (read-only) and lessons not completed are hidden.

### User Story 4 – Student reads lessons (Priority: P1)
**Acceptance Scenarios**
1. **Given** an assigned course, **When** the student opens it, **Then** they see its sections and Published lessons in order, each with minutes and marked Open or Locked. (Due/overdue chips arrive with 003; Done and the course progress card with 004.)
2. **Given** a lesson whose unlock rule is "after previous", **When** the previous Published lesson in course order is not complete, **Then** the lesson shows Locked and cannot be opened. **Given** a lesson whose rule is "on date", **When** that date has not yet started in the student's time zone, **Then** it shows Locked.
3. **Given** a lesson, **When** opened, **Then** Markdown (headings, lists, tables, images, code, audio, YouTube links) renders with Japanese and Burmese text displayed correctly; a YouTube URL alone on its own line shows an embedded player, while inline YouTube links stay plain links.

### User Story 5 – Student creates personal courses (Deferred — not in 002)
Moved out of this feature (clarified 2026-11-21); to be specified in a later feature. Intended behaviour: students create their own courses ("Mine"), visible only to them and their admin (read-only for the admin). 002 builds no personal-course UI or actions.

### Edge Cases
- Very long Markdown (> 50 KB) → still renders; above 200 KB the editor shows a warning and pauses saving until the text is shorter (database limit).
- Image upload > 10 MB → rejected with message; images are resized client-side.
- Reordering while another device edits → last write wins per lesson; order conflicts resolved by server `position` recompute.
- Unsafe HTML in Markdown → stripped (no raw HTML, sanitize).
- Embedded YouTube player while offline or blocked → shows a plain link to the video instead.

## Requirements

### Functional Requirements
- **FR-001**: Admins MUST create, edit, duplicate, archive, delete and restore courses.
- **FR-002**: Courses MUST have title, icon character, colour, description, target date (optional), level tag (optional), unlock-in-order flag, "students can add personal notes" flag (default on; stored only, no behaviour until a notes feature is specified), status (Draft/Active/Archived).
- **FR-003**: Courses MUST contain optional sections; lessons MUST belong to a course and optionally a section, with an explicit position.
- **FR-004**: Lessons MUST have title, estimated minutes, Markdown body, attachments (file or link), assignment prompt (optional), "submit before complete" flag, unlock rule (none / after previous / on date), status (Draft/Published). "After previous" means the previous Published, non-deleted lesson in course order; "on date" opens at 00:00 in the student's time zone. The course's unlock-in-order flag only sets the rule for new lessons and, when changed, rewrites the "none"/"after previous" rules of all its lessons; locking is decided by each lesson's rule alone.
- **FR-005**: Only Published lessons of Active courses MUST be visible to assigned students; for Archived courses, only the lessons that student completed stay visible (read-only).
- **FR-006**: Deletes MUST be soft (`deleted_at`) and purged after 30 days. Until the purge, related student progress and submissions are kept, and restoring brings them back unchanged.
- **FR-007**: Markdown MUST be sanitized; raw HTML disallowed. The only embedded content allowed is a YouTube player (privacy-enhanced domain) produced by the app's own renderer from a YouTube URL alone on its own line.
- **FR-008**: Files MUST be stored in Supabase Storage with access limited to the admin and assigned students.
- **FR-009**: Course list MUST support search and filters Active / Drafts / Archived, showing lesson count, assigned students and average progress.
- **FR-010**: The student course screen in this feature MUST show sections, lesson order, minutes and Open/Locked only. Locked is derived from lesson completion records (written by 004's "Mark complete"; seeded directly in 002 tests). Status chips (003 FR-005) and the progress card (004) are out of scope here.

### Permissions
| Action | Student | Admin |
| --- | --- | --- |
| Create/edit/delete admin courses & lessons | – | ✓ own |
| Read published lessons of assigned courses | ✓ | ✓ |
| Create personal course *(deferred, not in 002)* | ✓ | read-only |

### Key Entities
- **Course**, **CourseSection**, **Lesson**, **LessonResource** (file/link/audio).

## Success Criteria
- **SC-001**: An Admin can create a course with 5 lessons in under 10 minutes on a phone.
- **SC-002**: Preview and student view render identical HTML for the same Markdown (snapshot test).
- **SC-003**: Zero students can read Draft or deleted content (guard tests and RLS tests).
