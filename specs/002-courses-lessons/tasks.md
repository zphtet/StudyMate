---
description: "Tasks for 002 Courses and Lessons"
---

# Tasks: Courses and Lessons

**Input**: Design documents from `specs/002-courses-lessons/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md (clarified 2026-11-21); from 001: T005 (secret key in `.env`) and T025 (e2e fixtures)

**Tests**: Required. Constitution III (test-first): pgTAP for database rules, Vitest for logic and guards (written and failing before the code), Playwright per user story at 390×844 and 1280×800.

**Organization**: Grouped by user story in priority order: US1, US2, US4 (P1), then US3 (P2). US5 is deferred (spec clarification) and has no tasks. Assignments (003) and completions (004) are seeded by test fixtures.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths follow plan.md › Project Structure; field rules cite `data-model.md` (`Entity.field`) instead of repeating them

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, environment, prerequisites from 001

- [X] T001 Add runtime dependencies `react-markdown remark-gfm rehype-sanitize @uiw/react-md-editor @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` to package.json with `pnpm add` at the versions in research.md R14 (lockfile updated)
- [X] T002 [P] Add shadcn components checkbox, toggle-group, collapsible into src/components/ui/ with `pnpm dlx shadcn@latest add …`
- [X] T003 Manual (project owner): confirm specs/001-auth-roles-linking/tasks.md T005 is done (`SUPABASE_SECRET_KEY` in `.env`) and set `CRON_SECRET` in `.env` to a long random string (specs/002-courses-lessons/quickstart.md §1); confirm when done
- [X] T004 If specs/001-auth-roles-linking/tasks.md T025 is still open, implement it as described there (tests/e2e/fixtures/supabase-admin.ts, tests/e2e/fixtures/users.ts, tests/e2e/global-teardown.ts, playwright.config.ts) and check it off in that file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migration and policies, guards, shared schemas, ordering, Markdown renderer, course colour tokens, student shell, fixtures. Every story depends on this phase.

**⚠️ CRITICAL**: no user story work starts until this phase is complete

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [X] T005 [P] pgTAP tests in supabase/tests/002_course_policies.test.sql (cases in research.md R15), wrapped in `begin … rollback`:
  - owner reads and writes their courses, sections, lessons and resources; another admin can't;
  - an assigned student reads Published, non-deleted lessons of an Active course, and not Draft lessons, deleted lessons, lessons of a Draft course or of an unassigned course;
  - in an Archived course, only lessons with a `done` `lesson_progress` row;
  - the same cases for `lesson_resources`;
  - Storage: `storage.objects` fixture rows under `lesson-files/<course>/<lesson>/…` follow `can_read_lesson`, and an insert whose lesson folder isn't in the course folder is refused;
  - the new CHECKs reject bad values for data-model.md Course.color, Course.description, Course.levelTag, CourseSection.title, CourseSection.position, Lesson.position, Lesson.assignmentPrompt, Lesson.unlockRule, LessonResource.name, LessonResource.sizeBytes and the LessonResource.url / LessonResource.storagePath target rule;
  - Course.allowStudentNotes defaults to true.
- [X] T006 [P] Guard tests in src/server/auth/guards.test.ts (extend the existing file and fixtures): `requireLessonOwner` (owner allowed, deleted lessons included; other admin and students → 404) and `requireLessonReader` with exactly the allowed and denied cases of T005 (data-model.md › Guards)
- [X] T007 [P] Unit tests in src/features/courses/schemas.test.ts for `courseFieldsSchema`, `lessonFieldsSchema` and `resourceSchema` (contracts/server-actions.md › Field schemas):
  - a one-grapheme kanji or emoji passes and two graphemes or a 3-code-point emoji fail (data-model.md Course.icon);
  - unknown colour keys fail (Course.color); `targetDate` must be `YYYY-MM-DD` (Course.targetDate);
  - content just over 204 800 UTF-8 bytes of Burmese text fails with `content_too_long` (Lesson.contentMd);
  - `estMinutes` bounds (Lesson.estMinutes); every Lesson.unlockRule variant, plus `on_date` without a date;
  - `link` requires an https `url`, and stored kinds require a `storagePath` under the given course and lesson (LessonResource.url, LessonResource.storagePath).
- [X] T008 [P] Unit tests in src/features/courses/order.test.ts:
  - course order puts the "no section" group first, then sections by data-model.md CourseSection.position, then lessons by Lesson.position;
  - admin numbering counts every non-deleted lesson, student numbering counts visible lessons;
  - renumbering gives 0..n−1 with no gaps, and ties are broken by Lesson.updatedAt (data-model.md › Ordering).
- [X] T009 [P] Unit tests in src/components/shared/youtube.test.ts: `watch?v=`, `youtu.be/`, `shorts/` and `embed/` URLs give the 11-character ID; `t=` and `start=` give a start time; invalid IDs and other hosts return null (research.md R5)
- [X] T010 [P] Component tests in src/components/shared/markdown.test.tsx with a fixture set covering:
  - Japanese and Burmese paragraphs, a table, a code block, an image, an `.mp3` target rendering `<audio controls>`;
  - a YouTube URL alone in a paragraph → iframe on `www.youtube-nocookie.com`; inline → plain link; offline (`navigator.onLine = false`) → plain link;
  - `<script>`, `<img onerror>` and `javascript:` links removed; external links get `rel="noopener noreferrer nofollow"`.

  Snapshot the HTML (SC-002 baseline, research.md R4).
- [X] T011 [P] Unit tests in src/lib/time.test.ts: `todayIn(timeZone)` with fake timers around midnight for Asia/Yangon, Asia/Tokyo, UTC and America/Los_Angeles (constitution IV)

### Implementation

- [X] T012 Migration:
  - Add `allowStudentNotes` to model `Course` in prisma/schema.prisma (data-model.md Course.allowStudentNotes).
  - Generate prisma/migrations/<UTC timestamp>_courses_lessons/migration.sql with the docs/data-model.md §7 diff.
  - Append by hand items 1–5 of data-model.md › Migration:
    - CHECKs for Course.color, Course.description, Course.levelTag, CourseSection.title, CourseSection.position, Lesson.position, Lesson.assignmentPrompt, Lesson.unlockRule, LessonResource.name, LessonResource.sizeBytes and the LessonResource.url / LessonResource.storagePath target rule;
    - function `can_read_lesson`;
    - replaced `lessons_read`, `resources_read`, `lesson_files_read`, `lesson_files_write` policies;
    - `lesson-files` bucket limits;
    - partial indexes on Course.deletedAt and Lesson.deletedAt.
  - Check the dev data first, then run `pnpm prisma migrate deploy` and `pnpm prisma generate`. T005 passes.
- [X] T013 Add `requireLessonOwner(lessonId)` and `requireLessonReader(lessonId)` to src/server/auth/guards.ts, mirroring `can_read_lesson`: data-model.md Lesson.status, Lesson.deletedAt, Course.status, Course.deletedAt, and the archived → completed-only rule. T006 passes
- [X] T014 [P] Add `HttpError(status, code)` to src/lib/http.ts and map it in `handle()` to `{ error: { code, message } }` with that status (research.md R13)
- [X] T015 [P] Implement `todayIn(timeZone)` with `Intl.DateTimeFormat('en-CA', { timeZone })` in src/lib/time.ts; T011 passes
- [X] T016 [P] Zod schemas in src/features/courses/schemas.ts and response types (contracts/route-handlers.md) in src/features/courses/types.ts:
  - `courseFieldsSchema`: data-model.md Course.title, Course.description, Course.icon (`Intl.Segmenter`), Course.color, Course.targetDate, Course.levelTag, Course.unlockInOrder, Course.allowStudentNotes, Course.status limited to draft | active;
  - `lessonFieldsSchema`: Lesson.title, Lesson.estMinutes, Lesson.sectionId, Lesson.unlockRule, Lesson.contentMd (UTF-8 bytes via `TextEncoder`), Lesson.assignmentPrompt, Lesson.requireSubmission;
  - `resourceSchema`: LessonResource.kind, LessonResource.name, LessonResource.url, LessonResource.storagePath, LessonResource.sizeBytes.

  T007 passes.
- [X] T017 [P] Ordering helpers in src/features/courses/order.ts (course order, per-viewer numbering, group renumbering per data-model.md › Ordering); T008 passes
- [X] T018 [P] YouTube URL parser in src/components/shared/youtube.ts and `YouTubeEmbed` (iframe attributes and offline fallback per research.md R5) in src/components/shared/youtube-embed.tsx; T009 passes
- [X] T019 Shared renderer `Markdown` in src/components/shared/markdown.tsx (react-markdown + remark-gfm + rehype-sanitize, `skipHtml`, overrides for `img` / audio, `p` / YouTube, `a`, table wrapper, code; line-height 1.7, per research.md R4). Add the `markdown` namespace (YouTube title, audio label) to src/i18n/messages/{en,my,ja}.json. T010 passes
- [X] T020 [P] Course colour tokens:
  - First extend src/app/theme-contrast.test.ts so each `--course-<key>` on `--course-<key>-soft` reaches 4.5:1 in light and dark (data-model.md Course.color, research.md R11), and see it fail.
  - Add the 12 tokens per mode to src/app/globals.css until it passes.
  - Then build `CourseIcon` (sizes sm / md / lg) in src/features/courses/components/course-icon.tsx and `StatusChip` (Published / Draft / Active / Archived / Locked, tokens only) in src/components/shared/status-chip.tsx.
- [X] T021 Student shell (research.md R12, contracts/ui-routes.md › Route layout):
  - Move src/app/s/today, courses, progress, shifts and me into src/app/s/(tabs)/, with src/app/s/(tabs)/layout.tsx rendering `StudentNav` and the bottom padding, plus a loading.tsx.
  - Keep the role and active-link checks in src/app/s/layout.tsx without the nav.
  - `pnpm typecheck` and `pnpm build` still pass, and the existing routes are unchanged.
- [X] T022 [P] Course fixtures in tests/e2e/fixtures/courses.ts:
  - `linkStudent(studentId, adminId)`;
  - `seedCourse({ ownerId, status, sections, lessons })`, which returns ids;
  - `assignCourse(courseId, studentId)`, `markDone(studentId, lessonId)`, `seedSubmission(studentId, lessonId, status)`;
  - `uploadLessonFile(courseId, lessonId, name, bytes)` via the admin client.

  Extend tests/e2e/global-teardown.ts to remove `lesson-files/<course>/…` objects of run users' courses (rows cascade with the users). Depends on T004.
- [X] T023 [P] Add `errors.<code>` messages for every new code in contracts/server-actions.md, plus `lesson_locked`, `file_not_found`, `file_too_large` and `file_type_not_allowed`, to src/i18n/messages/{en,my,ja}.json; src/i18n/messages.test.ts stays green

**Checkpoint**: migration applied, guards and policies tested, renderer ready; stories can start

---

## Phase 3: User Story 1 – Admin creates a course (Priority: P1) 🎯 MVP

**Goal**: admins create, edit, copy and activate courses, and find them in a searchable, filterable list.

**Independent Test**: create a course and see it under Drafts; copy a course (sections, lessons and files copied as Draft); set it Active and see it under Active.

### Tests for User Story 1 (write first, see them fail)

- [X] T024 [P] [US1] Unit tests in src/features/courses/copy.test.ts for the pure `planCopy(source, newIds)`:
  - deleted lessons are skipped; lessons become Draft with positions, rules and prompts kept; no assignments, progress or submissions (data-model.md › Copy rules);
  - every `/api/lesson-files/<old id>/` in Markdown is rewritten to the new resource id;
  - storage paths move to `<new course>/<new lesson>/` (data-model.md LessonResource.storagePath).
- [X] T025 [P] [US1] Playwright tests in tests/e2e/us1-create-course.spec.ts (fixtures from T022):
  - scenario 1: New course with every field, saved as Draft → course page, then listed under **Drafts · 1** and not under Active;
  - scenario 2: Copy existing course on a seeded course with sections, lessons and an uploaded file → new Draft course with the same structure, all lessons Draft, and the file URL returns 302 for the admin;
  - scenario 3: "Make active" → under **Active**;
  - ⋯ → Duplicate as template opens "{title} (copy)";
  - search by title and by level tag (FR-009); chip counts;
  - changing "Unlock lessons in order" on the edit page rewrites lesson rules (seeded `none` / `after_previous` / `on_date` lessons, checked through the fixture DB client);
  - editing an Archived course's title keeps it under Archived;
  - axe has no serious violations.

### Implementation for User Story 1

- [X] T026 [US1] Admin course repo in src/features/courses/repo.ts (`import 'server-only'`; data-model.md Course.ownerId is the caller, with `isPersonal` false on create; `ownerId` always in `where`):
  - `listAdminCourses(adminId)`: counts, students, `avgPercent` via typed `$queryRaw` on `course_progress` (research.md R10);
  - `getAdminCourse(adminId, courseId)` → AdminCourseDetail using order.ts, with groups from data-model.md Lesson.sectionId and Lesson.position;
  - `createCourse`; `updateCourse`, which rewrites `none` / `after_previous` rules in the same transaction when data-model.md Course.unlockInOrder changes (data-model.md Lesson.unlockRule), and ignores `status` when the course is archived;
  - `setCourseStatus` with the allowed data-model.md Course.status transitions;
  - every write sets data-model.md Course.updatedAt; deleted courses (data-model.md Course.deletedAt) return `course_not_found`.
- [X] T027 [US1] Copy in src/features/courses/copy.ts: the pure `planCopy` (T024 passes) and `duplicateCourse(me, sourceId, overrides)`, executing research.md R9:
  1. one Prisma transaction inserting rows with app-generated ids;
  2. then Storage `copy` with the caller's server Supabase client, at most 5 at a time;
  3. on any failure, hard-delete the new course and the copied files, and fail with `copy_failed`.
- [X] T028 [US1] Server Actions `createCourse` (with optional `copyFromId`), `updateCourse`, `setCourseStatus` and `duplicateCourse` in src/features/courses/actions.ts, with guards, inputs and errors per contracts/server-actions.md › Courses; client mutations invalidate per contracts/server-actions.md › Query invalidation
- [X] T029 [US1] Route Handlers GET src/app/api/admin/courses/route.ts (`requireRole('admin')`) and GET src/app/api/admin/courses/[courseId]/route.ts (`requireCourseOwner`, 404 when deleted), with shapes per contracts/route-handlers.md; `courseKeys`, `adminCoursesQuery` and `adminCourseQuery` in src/features/courses/queries.ts
- [X] T030 [P] [US1] Course form components (react-hook-form + `courseFieldsSchema`):
  - `CourseForm` in src/features/courses/components/course-form.tsx: Blank / Copy toggle with a source picker that prefills "{title} (copy)"; native date input for data-model.md Course.targetDate; checkboxes for Course.unlockInOrder and Course.allowStudentNotes; Status segmented control for Course.status;
  - `IconPicker` sheet in src/features/courses/components/icon-picker.tsx (data-model.md Course.icon; suggestions per research.md R11);
  - `ColorSwatches` radio group in src/features/courses/components/color-swatches.tsx (data-model.md Course.color, `aria-label` per colour).
- [X] T031 [P] [US1] `CourseCard` in src/features/courses/components/course-card.tsx: icon tile, title, "{n} lessons · {m} sections", student initials and average only when assignments exist; ⋯ menu with Open lessons, Edit details, Duplicate as template (Archive and Delete are added in US3)
- [X] T032 [US1] Admin Courses page src/app/a/(tabs)/courses/page.tsx (replace the placeholder) matching screenshots/17-AdminCourses.png and contracts/ui-routes.md:
  - header with "New course";
  - search over title and level tag, case-insensitive after NFKC;
  - chips Active / Drafts / Archived with counts, list, empty state per chip;
  - prefetch `adminCoursesQuery` with `HydrationBoundary`.
- [X] T033 [US1] Pages src/app/a/courses/new/page.tsx ("New course", "Create and add lessons" → `/a/courses/[id]`) and src/app/a/courses/[courseId]/edit/page.tsx ("Edit course", "Save", note under the unlock checkbox), both matching screenshots/19-AdminCourseForm.png; the edit page hides Status for Archived courses
- [X] T034 [US1] Course page base src/app/a/courses/[courseId]/page.tsx matching the top of screenshots/18-AdminCourse.png: back, "Edit details", icon, title, status chip, "{n} lessons · target {date}", Draft banner with "Make active" (US1 scenario 3), and an empty-course state (lessons are added in US2)
- [X] T035 [US1] Add the `courses`, `courseForm` and `courseDetail` (header) strings to src/i18n/messages/{en,my,ja}.json; T025 passes

**Checkpoint**: US1 independently functional (create, copy, edit, activate, list)

---

## Phase 4: User Story 2 – Admin builds lessons inside sections (Priority: P1)

**Goal**: sections and lessons with drag-and-drop ordering, a Markdown editor with a preview identical to the student view, attachments and inline media, 3-second autosave, publish and unpublish.

**Independent Test**: add 2 sections and 3 lessons, reorder (also across sections), publish; reload keeps the order; the preview renders like the student view.

### Tests for User Story 2 (write first, see them fail)

- [X] T036 [P] [US2] Playwright tests in tests/e2e/us2-build-lessons.spec.ts:
  - 2.1: add 2 sections and 3 lessons; the editor shows title, minutes, section, unlocks, Markdown, attachments and assignment;
  - 2.2: Preview renders a table, Japanese and Burmese text and a YouTube iframe;
  - 2.3: reorder with the keyboard sensor and with one pointer drag across sections, then reload and see the order persist;
  - 2.4: Publish → chip "Published";
  - 2.5: type, wait 3 s → "Saved hh:mm" in the viewer's zone, and reload keeps the text; a Published lesson autosaves the same way;
  - attach a small PDF and insert an image from the toolbar (preview shows it); a 12 MB file is rejected with a message;
  - swipe left shows Edit; axe.
- [X] T037 [P] [US2] Hook tests in src/features/courses/use-autosave.test.tsx (fake timers):
  - saves 3 s after the last change; one save in flight per lesson (mutation scope);
  - flushes on `visibilitychange` hidden and on explicit flush; no save while the form is invalid;
  - paused above the data-model.md Lesson.contentMd limit;
  - status goes saving → saved → error.
- [X] T038 [P] [US2] Unit tests in src/features/courses/upload.test.ts:
  - rejects files over the data-model.md LessonResource.sizeBytes limit and types outside the research.md R3 allow-list;
  - resize target ≤ 1600 px on the long edge, aspect kept;
  - path `<courseId>/<lessonId>/<uuid>.<ext>` (data-model.md LessonResource.storagePath).
- [X] T039 [P] [US2] Repo tests against the dev database in src/features/courses/lesson-repo.test.ts:
  - `createLesson` takes its rule from data-model.md Course.unlockInOrder (Lesson.unlockRule) and goes last in its group (Lesson.position);
  - `saveLesson` refuses a section from another course (Lesson.sectionId, `invalid_section`), and moving a lesson renumbers both groups;
  - `reorderLessons` refuses foreign or duplicate ids and writes gapless positions; a list missing a lesson added by another device keeps that lesson, placed after the listed ones;
  - `deleteSection` refuses a section with non-deleted lessons (`section_not_empty`);
  - `removeLessonResource` is scoped to the owner.

### Implementation for User Story 2

- [X] T040 [US2] Lesson and section repo in src/features/courses/lesson-repo.ts (`import 'server-only'`; every `where` scoped by `course: { ownerId: me.id }`):
  - section create, rename, move and delete-when-empty (data-model.md CourseSection.courseId, CourseSection.title, CourseSection.position);
  - `createLesson`: translated default data-model.md Lesson.title, Lesson.status draft, rule from the course switch, Lesson.courseId fixed;
  - `saveLesson`: data-model.md Lesson.sectionId same course, Lesson.contentMd, Lesson.estMinutes, Lesson.assignmentPrompt, Lesson.requireSubmission; sets Lesson.updatedAt and returns it;
  - `setLessonStatus`; `reorderLessons` (one transaction, order.ts renumbering);
  - `getAdminLesson`: `previousLesson`, `sections`, `resources`;
  - `addResource` / `removeResource`: data-model.md LessonResource.lessonId, LessonResource.kind, LessonResource.name, LessonResource.url, LessonResource.storagePath, LessonResource.sizeBytes; removal deletes the row, then the file with the caller's Storage client.

  T039 passes.
- [X] T041 [US2] Server Actions `addSection`, `renameSection`, `moveSection`, `deleteSection` in src/features/courses/actions.ts, and `createLesson`, `saveLesson`, `setLessonStatus`, `reorderLessons`, `addLessonResource`, `removeLessonResource` in src/features/courses/lesson-actions.ts, with guards, inputs and errors per contracts/server-actions.md › Sections and › Lessons
- [X] T042 [US2] Route Handlers:
  - GET src/app/api/admin/lessons/[lessonId]/route.ts (`requireLessonOwner`, 404 when the lesson or its course is deleted), with `adminLessonQuery` in src/features/courses/queries.ts;
  - GET src/app/api/lesson-files/[resourceId]/[name]/route.ts, owner path only: `requireLessonOwner`, 1-hour signed URL from the caller's server Supabase client, 302 with `Cache-Control: private, max-age=300`, `link` → 404 (contracts/route-handlers.md › Files).
- [X] T043 [P] [US2] Client upload helper in src/features/courses/upload.ts: size and type checks, image resize with `createImageBitmap` + canvas (WebP or JPEG at 0.82), upload to bucket `lesson-files` with the browser Supabase client, return the `resourceSchema` input (research.md R3); T038 passes
- [X] T044 [P] [US2] Autosave hook in src/features/courses/use-autosave.ts (3 s debounce, `useMutation` with `scope: { id: 'lesson:<id>' }`, flush API, pending / failed state for the `beforeunload` guard, per research.md R6); T037 passes
- [X] T045 [US2] `LessonEditor` in src/features/courses/components/lesson-editor.tsx. First write src/features/courses/components/lesson-editor.test.tsx: render `LessonEditor` in Preview with each T010 sample and assert the preview pane's HTML equals `renderToStaticMarkup(<Markdown source={…} />)` (SC-002); see it fail. Then build:
  - `@uiw/react-md-editor` via `next/dynamic` with `ssr: false`; `data-color-mode` from next-themes;
  - Write / Preview toggle-group on phones, `live` at ≥ 1024 px;
  - toolbar H, B, I, list, plus image and audio commands that upload (T043), call `addLessonResource` and insert `![name](/api/lesson-files/<id>/<name>)`;
  - `components.preview` renders `Markdown`;
  - byte counter with the warning above the data-model.md Lesson.contentMd limit.

  The lesson-editor test passes.
- [X] T046 [P] [US2] `AttachmentList` with the "+ File or link" sheet (upload a file, or a link with a title) in src/features/courses/components/attachment-list.tsx (data-model.md LessonResource.kind file | link)
- [X] T047 [US2] Lesson editor page src/app/a/courses/[courseId]/lessons/[lessonId]/edit/page.tsx matching screenshots/20-AdminLessonEdit.png and contracts/ui-routes.md:
  - "Saved hh:mm" / "Saving…" / "Not saved · Retry" in the viewer's zone;
  - Title, Minutes, Section select (with "No section"), Unlocks select ("After {n}", "Always open", "On a date…" + date field, data-model.md Lesson.unlockRule);
  - editor, attachments, assignment prompt, "Submit assignment before marking complete";
  - bottom bar: Save draft + Publish (Draft) or Unpublish + Save (Published) for data-model.md Lesson.status;
  - in-app confirm on Back and `beforeunload` while a save is pending or failed.
- [X] T048 [US2] `SortableLessonList` in src/features/courses/components/sortable-lessons.tsx and `SectionHeader` in src/features/courses/components/section-header.tsx:
  - dnd-kit multi-container with activation only from the ⋮⋮ handle; keyboard sensor with translated announcements;
  - swipe left reveals Edit (and a Delete slot, wired in US3);
  - collapsible sections with ⋯ (Rename, Move up, Move down, Delete when empty);
  - "+ Add lesson" per group, "+ Add section" with an inline title field;
  - optimistic reorder with rollback on error (research.md R7).
- [X] T049 [US2] Show groups and lessons on src/app/a/courses/[courseId]/page.tsx matching screenshots/18-AdminCourse.png: rows "{number} · {title}", "{min} min · assignment / audio / not visible to students", Published / Draft chip, hint text under the list; a course with no sections shows the untitled group with "+ Add lesson" (US2 scenario 1)
- [X] T050 [US2] Add the `lessonEditor` and `courseDetail` (sections, lessons, hint) strings to src/i18n/messages/{en,my,ja}.json; T036 passes

**Checkpoint**: US1 + US2 functional; an admin can build a full course

---

## Phase 5: User Story 4 – Student reads lessons (Priority: P1)

**Goal**: an assigned student sees the course's sections and visible lessons, each Open or Locked, and reads lessons with full Markdown, attachments and the assignment prompt.

**Independent Test** (seeded admin, link, course, assignment): the student sees Published lessons in order with Open/Locked; a locked lesson can't be opened; a lesson renders Japanese, Burmese, a table, an image, audio and YouTube.

### Tests for User Story 4 (write first, see them fail)

- [ ] T051 [P] [US4] Unit tests in src/features/courses/lock.test.ts for `computeLocks()` (research.md R1, data-model.md Lesson.unlockRule):
  - `none` is open; with `after_previous`, the first visible lesson is open;
  - previous not done → locked with the previous number and title; a locked chain stays locked;
  - Draft and deleted lessons (Lesson.status, Lesson.deletedAt) are skipped when finding the previous lesson;
  - `on_date` the day before, the same day and after, in Asia/Yangon versus UTC around midnight;
  - every lesson of an Archived course is open.
- [ ] T052 [P] [US4] Playwright tests in tests/e2e/us4-student-reads.spec.ts (seeded via T022):
  - /s/courses lists the assigned Active course;
  - 4.1: sections and Published lessons in order with minutes; Draft lessons are absent;
  - 4.2: an `after_previous` lesson shows "Locked · unlocks after {n}", and opening its URL shows the locked message; after `markDone` on the previous lesson it opens; an `on_date` lesson in the future shows "opens {date}";
  - 4.3: Markdown with Japanese, Burmese, a table, an image, an `<audio>` element and a YouTube iframe; attachments open; the assignment prompt is shown;
  - an admin's edit to a Published lesson appears on reload (US2 scenario 5);
  - an unassigned student and a Draft course give 404; axe.

### Implementation for User Story 4

- [ ] T053 [US4] `computeLocks()` in src/features/courses/lock.ts using `todayIn` (T015) and order.ts (T017); T051 passes
- [ ] T054 [US4] Student repo in src/features/courses/student-repo.ts (`import 'server-only'`; `studentId` always in `where`):
  - `listStudentCourses`: assigned, not deleted, data-model.md Course.status active / archived;
  - `getStudentCourse`: visible lessons per data-model.md Lesson.status and Lesson.deletedAt; Archived courses show completed lessons only; locks from `computeLocks` with the student's time zone and done set;
  - `getStudentLesson`: "n of m"; attachments limited to data-model.md LessonResource.kind file | link; a locked lesson throws `HttpError(403, 'lesson_locked')`.
- [ ] T055 [US4] Route Handlers:
  - GET src/app/api/courses/route.ts (`requireRole('student')`);
  - GET src/app/api/courses/[courseId]/route.ts (`requireRole('student')` + `requireCourseReader`);
  - GET src/app/api/lessons/[lessonId]/route.ts (`requireRole('student')` + `requireLessonReader` + lock check);
  - `studentCoursesQuery`, `studentCourseQuery` and `studentLessonQuery` in src/features/courses/queries.ts;
  - add the reader path (`requireLessonReader` + not locked) to src/app/api/lesson-files/[resourceId]/[name]/route.ts, creating that route if T042 isn't done yet (contracts/route-handlers.md).
- [ ] T056 [US4] Student Courses page src/app/s/(tabs)/courses/page.tsx (replace the placeholder) matching screenshots/05-Courses.png, partial per contracts/ui-routes.md: chips Active · n and Archived · n (when any), cards with icon, title and "{n} lessons · finish by {date}", empty state
- [ ] T057 [US4] Student course page src/app/s/courses/[courseId]/page.tsx matching screenshots/09-Course.png (partial): back; title; "Assigned by {admin} · finish by {date}"; Archived banner; section headings. `StudentLessonRow` in src/features/courses/components/student-lesson-row.tsx: number circle, title, minutes, lock reason, Locked chip; locked rows `aria-disabled` and not links
- [ ] T058 [US4] Lesson page src/app/s/lessons/[lessonId]/page.tsx matching screenshots/10-Lesson.png (partial): "{course} · Lesson {n} of {m}", title, minutes, `Markdown` body, attachments (name + size, or link), read-only assignment card, locked state with reason and back link
- [ ] T059 [US4] Add the `studentCourses` and `lessonView` strings to src/i18n/messages/{en,my,ja}.json; T052 passes

**Checkpoint**: all P1 stories functional; feature MVP

---

## Phase 6: User Story 3 – Admin edits, archives and deletes safely (Priority: P2)

**Goal**: safe lesson delete (impact list, "Unpublish instead"), course delete with typed confirmation, Recently deleted with restore for 30 days, archive and unarchive, and a daily purge.

**Independent Test**: delete a lesson with seeded student work (students listed, Unpublish instead works); delete and restore a course with its progress intact; archive a course so students keep only completed lessons.

### Tests for User Story 3 (write first, see them fail)

- [ ] T060 [P] [US3] Tests in src/features/courses/purge.test.ts against the dev database, with an injected `now` and the Storage removal mocked:
  - selects courses and lessons whose data-model.md Course.deletedAt / Lesson.deletedAt is more than 30 days old, and nothing at 30 days or less;
  - collects `lesson-files` prefixes and `submissions.attachments` paths;
  - rows stay when file removal fails; a second run is a no-op.
- [ ] T061 [P] [US3] Repo tests in src/features/courses/delete.test.ts against the dev database:
  - `deleteCourse` with a wrong title → `title_mismatch`;
  - `restoreCourse` within 30 days brings back lessons and leaves progress rows untouched; after 30 days → `restore_expired`;
  - `deleteLesson` renumbers its group; `restoreLesson` returns to its old position, or "no section" if the section is gone;
  - `getLessonImpact` follows the data-model.md › Student work table.
- [ ] T062 [P] [US3] Playwright tests in tests/e2e/us3-delete-restore.spec.ts:
  - 3.1: editor 🗑 on a Published lesson with a seeded draft submission lists the student as "Draft assignment"; "Unpublish instead" sets it Draft; deleting removes it from the course page;
  - 3.3: Recently deleted lists the lesson, and Restore puts it back in place;
  - 3.2: ⋯ → Delete course is enabled only for the exact name;
  - restoring the course keeps the student's seeded progress;
  - 3.4: Archive → the student sees the course under Archived with only the completed lesson, and the incomplete lesson's URL gives 404;
  - `/api/cron/purge` without the bearer → 401; axe.

### Implementation for User Story 3

- [ ] T063 [US3] Repo functions:
  - `deleteCourse` (trimmed title must equal data-model.md Course.title), `restoreCourse` and `listRecentlyDeleted` in src/features/courses/repo.ts;
  - `deleteLesson`, `restoreLesson` and `getLessonImpact` in src/features/courses/lesson-repo.ts.

  All set or clear data-model.md Course.deletedAt / Lesson.deletedAt per research.md R8 and renumber with order.ts. T061 passes.
- [ ] T064 [US3] Server Actions `deleteCourse` and `restoreCourse` in src/features/courses/actions.ts, and `deleteLesson` and `restoreLesson` in src/features/courses/lesson-actions.ts (contracts/server-actions.md). Route Handlers GET src/app/api/admin/lessons/[lessonId]/impact/route.ts (`requireLessonOwner`) and GET src/app/api/admin/courses/deleted/route.ts (`requireRole('admin')`), with `lessonImpactQuery` and `recentlyDeletedQuery` in src/features/courses/queries.ts
- [ ] T065 [US3] `purgeExpired(now)` in src/features/courses/purge.ts, plus `removeStorageObjects(bucket, paths)` and `listStoragePrefix(bucket, prefix)` in src/server/supabase-admin.ts (secret-key client, server-only). Files are removed before rows, per research.md R8. T060 passes
- [ ] T066 [US3] Cron Route Handler src/app/api/cron/purge/route.ts: constant-time comparison of `Authorization: Bearer ${CRON_SECRET}`, 401 otherwise; returns `PurgeResult`. Add vercel.json with `crons: [{ path: '/api/cron/purge', schedule: '0 3 * * *' }]`
- [ ] T067 [P] [US3] `DeleteLessonSheet` in src/features/courses/components/delete-lesson-sheet.tsx (matches screenshots/21-AdminDelete.png; gender-neutral copy; impact list; "Unpublish instead" only for Published lessons) and `DeleteCourseDialog` in src/features/courses/components/delete-course-dialog.tsx (typed name, button disabled until it matches)
- [ ] T068 [US3] Wire the delete and archive entry points:
  - 🗑 in the lesson editor (T047) and swipe Delete in `SortableLessonList` (T048) open `DeleteLessonSheet`;
  - `CourseCard` ⋯ gains Archive / Unarchive and Delete course;
  - src/app/a/courses/[courseId]/page.tsx gets the Archived banner with Unarchive;
  - src/app/a/courses/[courseId]/edit/page.tsx gets "Delete course".
- [ ] T069 [US3] Recently deleted page src/app/a/courses/deleted/page.tsx (lists, "Deleted {relative} · removed for good on {date}" in the viewer's zone, Restore, empty state) and a "Recently deleted" footer link on src/app/a/(tabs)/courses/page.tsx
- [ ] T070 [US3] Add the `deleteFlow`, `recentlyDeleted` and `courses` (archive / delete) strings to src/i18n/messages/{en,my,ja}.json; T062 passes

**Checkpoint**: all stories in scope functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T071 [P] Documentation:
  - docs/data-model.md: `allow_student_notes` in the `courses` row; `can_read_lesson` and the new CHECKs in §4.
  - docs/technical-spec.md: §3 the `s/(tabs)` group and `lesson-files` path layout; §9 / §17 daily purge via Vercel Cron; §14 CSP must allow `frame-src https://www.youtube-nocookie.com`.
  - .env.example: note that `CRON_SECRET` also protects `/api/cron/purge`.
- [ ] T072 [P] Review every new `my` and `ja` string for completeness and tone; list strings needing a native speaker under a `_review` note in specs/002-courses-lessons/quickstart.md
- [ ] T073 [P] Accessibility and layout pass at 390×844 and 1280×800: 44 px targets, labels, `aria-label` on icon buttons, focus order in sheets and dialogs, keyboard reorder, every swipe action also available without swiping, editor split view at ≥ 1024 px. Fix findings in src/features/courses/components/ and src/components/shared/
- [ ] T074 Compare each screen in src/app/a/(tabs)/courses/, src/app/a/courses/, src/app/s/(tabs)/courses/, src/app/s/courses/ and src/app/s/lessons/ with screenshots/05, 09, 10, 17, 18, 19, 20, 21 at 390×844, and fix layout, hierarchy and copy, keeping only the "partial" differences documented in contracts/ui-routes.md
- [ ] T075 Performance: confirm with `pnpm build` output that `@uiw/react-md-editor` and `@dnd-kit/*` load only on admin course and editor routes; Lighthouse performance on `/s/lessons/[id]` (mobile) ≥ 90; record both results in specs/002-courses-lessons/quickstart.md §6
- [ ] T076 Run every gate from package.json scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`
- [ ] T077 Walk through specs/002-courses-lessons/quickstart.md §4 scenarios 1–16 and §5 (purge), and note any failures
- [ ] T078 Set **Status** to `Implemented` in specs/002-courses-lessons/spec.md (constitution quality gate)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none. T003 (secret key, `CRON_SECRET`) must be done before T022, T065 and any e2e run; T004 before T022.
- **Foundational (2)**: after Setup; blocks every story. T012 before T013; T018 before T019; T015 and T017 are needed by US4's T053.
- **US1 (3)**: after Foundational.
- **US2 (4)**: after US1 (it fills the course page from T034 and uses the actions file from T028).
- **US4 (5)**: after Foundational only, since tests seed courses. It can run in parallel with US1 and US2; T055 extends the file route from T042, or creates it if US2 isn't done.
- **US3 (6)**: T060–T067 after Foundational; T068 needs T031, T033, T047 and T048 (US1 + US2); T069 needs T032.
- **Polish (7)**: after the stories you're shipping.

### Within each story

Tests first and failing → repo → actions and route handlers → components → pages → strings → story tests pass.

### Shared files (no [P] between these tasks)

- src/features/courses/actions.ts: T028 → T041 → T064
- src/features/courses/lesson-actions.ts: T041 → T064
- src/features/courses/repo.ts: T026 → T063
- src/features/courses/lesson-repo.ts: T040 → T063
- src/features/courses/queries.ts: T029 → T042 → T055 → T064
- src/i18n/messages/*.json: T019, T023, T035, T050, T059, T070 (one at a time)

### Parallel opportunities

- Setup: T002 alongside T001.
- Foundational tests: T005–T011 together; then T014–T018, T020 and T022–T023 together.
- US1: T024 with T025; T030 and T031 alongside T026–T029.
- US2: T036–T039 together; T043, T044 and T046 alongside T040–T042.
- US4: T051 with T052; the whole phase alongside US1/US2 if two people work on it.
- US3: T060–T062 together; T065–T067 alongside T063–T064.

---

## Parallel Example: User Story 2

```bash
# Tests together:
Task: "Playwright tests/e2e/us2-build-lessons.spec.ts"
Task: "Hook tests src/features/courses/use-autosave.test.tsx"
Task: "Unit tests src/features/courses/upload.test.ts"
Task: "Repo tests src/features/courses/lesson-repo.test.ts"

# Then independent implementation:
Task: "Client upload helper src/features/courses/upload.ts"
Task: "Autosave hook src/features/courses/use-autosave.ts"
Task: "AttachmentList src/features/courses/components/attachment-list.tsx"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup (including T003 by the project owner).
2. Phase 2 Foundational.
3. Phase 3 (US1). **Stop and validate** with quickstart scenarios 1–3.
4. Phases 4 and 5 (US2, US4): the feature's MVP. Admins build courses and students read them (quickstart scenarios 4–11, 16).

### Incremental delivery

5. US3 (delete, restore, archive, purge): quickstart scenarios 12–15 and §5.
6. Polish, then merge `002-courses-lessons` into `main`.

Implement in small batches (`/speckit-implement Phase 1`, `… T005–T011`, …), reviewing each diff and running tests before the next batch.

---

## Notes

- [P] = different files and no dependency on unfinished tasks.
- Every new Route Handler and Server Action starts with a guard; the cron route is the only exception (plan.md › Complexity Tracking).
- Never import src/server/supabase-admin.ts from client code; uploads in the browser use the browser Supabase client with the user's token.
- Commit after each task group; commit `schema.prisma` and the migration together (docs/data-model.md §7).
