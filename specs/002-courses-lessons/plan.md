# Implementation Plan: Courses and Lessons

**Branch**: `002-courses-lessons` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-courses-lessons/spec.md`, clarified on 2026-11-21:
- the student course screen shows Open/Locked only; status chips come with 003 and 004;
- autosave is live on Published lessons;
- the notes switch is stored only;
- the course unlock switch rewrites lesson rules, and each lesson's own rule decides locking;
- personal courses (US5) are deferred;
- a YouTube link alone on its line embeds;
- copies include files;
- archived courses keep completed lessons only;
- restore brings student work back.

## Summary

Admins create, edit, copy, archive, delete and restore courses. They build Markdown lessons inside sections with drag-and-drop ordering, 3-second autosave, attachments and inline image/audio in private Storage. Students assigned to a course read its Published lessons, with Open/Locked pacing.

It builds on `0_init`, which already has the tables, RLS, buckets and course guards. The feature adds:
- a migration with one column, CHECK constraints, a lesson-level read function (`can_read_lesson`) used by table and Storage policies, and bucket limits;
- two guards (`requireLessonOwner`, `requireLessonReader`);
- Route Handlers for every read, Server Actions for every write;
- one shared `Markdown` renderer used by both the editor preview and the student view;
- a pure, unit-tested lock function;
- a daily purge job.

Assignments (003) and completion (004) aren't built here; tests seed those rows.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies**:
- Already in the project: Next.js 16.4 (App Router, `cacheComponents`), React 19.3, `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.119 (Storage uploads, signed URLs, copy), Prisma 7.10, TanStack Query 5.108, react-hook-form + Zod 4, next-intl 4, Tailwind CSS 4.3, shadcn/ui.
- **To add**: `react-markdown` 10.1, `remark-gfm` 4.0, `rehype-sanitize` 6.0, `@uiw/react-md-editor` 4.2, `@dnd-kit/core` 6.3 + `@dnd-kit/sortable` 10.0 + `@dnd-kit/utilities` 3.2, and shadcn `checkbox`, `toggle-group`, `collapsible` (research R14).

**Storage**: Supabase Postgres via Prisma (`courses`, `course_sections`, `lessons`, `lesson_resources`; reads `course_assignments`, `lesson_progress`, `submissions`, `course_progress`). Supabase Storage bucket `lesson-files` (private, 10 MB, MIME allow-list). Vercel Cron for the daily purge.

**Testing**: pgTAP (`pnpm test:db`) for policies, Storage and CHECKs. Vitest for guards against the dev DB and unit tests for lock rules, schemas, YouTube parsing, the Markdown snapshot (SC-002), copy rewriting, renumbering and purge selection. Playwright US1–US4 at 390×844 and 1280×800 with axe.

**Target Platform**: mobile browsers first (iOS Safari 16.4+, Android Chrome), desktop; Vercel

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- an admin creates a course with 5 lessons in < 10 min on a phone (SC-001);
- autosave fires 3 s after typing stops, and "Saved" shows within 1 s on 4G;
- the student lesson page renders 50 KB of Markdown without jank;
- Lighthouse performance ≥ 90 on `/s/lessons/[id]` (mobile).

The editor bundle (MDEditor, dnd-kit) loads only on admin editor routes.

**Constraints**:
- no local Supabase or Docker;
- Markdown ≤ 200 KB (database CHECK);
- files ≤ 10 MB, images resized to ≤ 1600 px;
- raw HTML disallowed;
- Prisma bypasses RLS, so guards come first;
- the e2e fixtures from 001 (T025) are a prerequisite.

**Scale/Scope**: dozens of courses per admin, up to ~100 lessons per course, hundreds of students. 9 screens plus 2 sheets/dialogs, 3 languages.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 002 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. Every Route Handler and Server Action starts with a guard; the cron route is the one exception, justified below. RLS is tightened so students can't reach Draft, deleted or archived-but-incomplete lessons or their files (`can_read_lesson`), and new guards mirror it | ✅ | ✅ |
| II. Spec first | Spec clarified (9 recorded answers). Screenshot differences are documented as "partial" in contracts/ui-routes.md: no 003/004 chips, gender-neutral delete copy, no "Assign" until 003 | ✅ | ✅ |
| III. Test-first | pgTAP for the migration and policies, including Storage; guard tests with the same cases; unit tests for lock, schemas, Markdown, copy and purge written before the code; one Playwright spec per user story | ✅ | ✅ |
| IV. Time | Instants in UTC; "Saved hh:mm" and "Recently deleted" times in the viewer's zone; `on_date` opens at 00:00 in the **student's** zone; target dates are calendar dates without time-zone conversion | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | 390 px first; 44 px targets; drag works by keyboard (dnd-kit keyboard sensor) and every swipe action also works without swiping; split-view editor ≥ 1024 px; course colours are theme tokens with a contrast test | ✅ | ✅ |
| VI. Three languages | All UI strings in `en`/`my`/`ja`; lesson Markdown isn't translated; Noto Sans JP / Myanmar fallbacks with taller line-height in rendered lessons | ✅ | ✅ |
| VII. Stack | Exactly the constitution's libraries (react-markdown + remark-gfm + rehype-sanitize, `@uiw/react-md-editor`, `@dnd-kit`); supabase-js only for Storage (upload, signed URL, copy, remove; constitution 2.0.1); Prisma for all tables; Route Handler cron instead of an Edge Function | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db, build; screenshots matched; spec status updated | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| List own courses, see stats | – | ✓ own | `requireRole('admin')` + `ownerId` in `where` |
| Create a course (blank or copy) | – | ✓ | `requireRole('admin')`; copy: `requireCourseOwner(source)` |
| Edit, set status, duplicate, delete, restore a course | – | ✓ own | `requireCourseOwner` |
| Add, rename, move, delete sections | – | ✓ own | `requireRole('admin')` + `course.ownerId` in `where` |
| Create, edit, publish, reorder, delete, restore lessons; manage attachments | – | ✓ own | `requireCourseOwner` / `requireLessonOwner` |
| See who would be affected by a lesson delete | – | ✓ own | `requireLessonOwner` |
| List assigned courses | ✓ (Active + Archived) | – | `requireRole('student')` + `studentId` in `where` |
| Read a course's visible lessons | ✓ assigned | ✓ own | `requireCourseReader` |
| Open a lesson / its files | ✓ Published, unlocked; archived: completed only | ✓ own | `requireLessonReader` (+ lock check) / `requireLessonOwner` |
| Create a personal course | deferred (US5) | – | — |
| Purge expired deletes | — | — | `CRON_SECRET` bearer (Complexity Tracking) |

## Project Structure

### Documentation (this feature)

```text
specs/002-courses-lessons/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R15
├── data-model.md        # entities, rules, lifecycles, migration, guards
├── quickstart.md        # prerequisites, commands, manual scenarios
├── contracts/
│   ├── route-handlers.md
│   ├── server-actions.md
│   └── ui-routes.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── a/(tabs)/courses/page.tsx                    # list (replaces placeholder)
│   ├── a/courses/new · deleted /page.tsx
│   ├── a/courses/[courseId]/page.tsx · edit/page.tsx
│   ├── a/courses/[courseId]/lessons/[lessonId]/edit/page.tsx
│   ├── s/(tabs)/layout.tsx                          # StudentNav (moved from s/layout.tsx)
│   ├── s/(tabs)/today · courses · progress · shifts · me /…  # existing tab pages moved
│   ├── s/courses/[courseId]/page.tsx
│   ├── s/lessons/[lessonId]/page.tsx
│   └── api/
│       ├── admin/courses/route.ts · admin/courses/[courseId]/route.ts · admin/courses/deleted/route.ts
│       ├── admin/lessons/[lessonId]/route.ts · admin/lessons/[lessonId]/impact/route.ts
│       ├── courses/route.ts · courses/[courseId]/route.ts · lessons/[lessonId]/route.ts
│       ├── lesson-files/[resourceId]/[name]/route.ts
│       └── cron/purge/route.ts
├── features/courses/
│   ├── actions.ts            # courses + sections
│   ├── lesson-actions.ts     # lessons + resources
│   ├── repo.ts               # admin course reads/writes (Prisma)
│   ├── lesson-repo.ts (+ .test)  # sections, lessons, resources (Prisma)
│   ├── student-repo.ts       # student reads (Prisma)
│   ├── queries.ts            # queryOptions + keys
│   ├── schemas.ts (+ .test)  # course/lesson/resource Zod
│   ├── lock.ts (+ .test)     # Open/Locked (research R1)
│   ├── order.ts (+ .test)    # course order, numbering, renumbering
│   ├── copy.ts (+ .test)     # duplicate plan + Markdown id rewrite
│   ├── purge.ts (+ .test)    # purgeExpired(now)
│   ├── upload.ts             # client: checks, image resize, Storage upload
│   ├── use-autosave.ts       # debounce + scoped mutation + flush
│   ├── types.ts
│   └── components/           # CourseCard, CourseForm, IconPicker, ColorSwatches, CourseIcon,
│                             # SortableLessonList, SectionHeader, LessonEditor, AttachmentList,
│                             # DeleteLessonSheet, DeleteCourseDialog, StudentLessonRow
├── components/shared/
│   ├── markdown.tsx (+ .test.tsx)   # shared renderer (research R4)
│   ├── youtube.ts (+ .test)         # URL parsing + embed (R5)
│   └── status-chip.tsx
├── lib/
│   ├── http.ts                      # + HttpError(status, code)
│   └── time.ts (+ .test)            # todayIn(timeZone)
├── server/
│   ├── auth/guards.ts (+ .test)     # + requireLessonOwner, requireLessonReader
│   └── supabase-admin.ts            # + storage removal for the purge
└── i18n/messages/{en,my,ja}.json    # new namespaces (contracts/ui-routes.md)

prisma/
├── schema.prisma                    # + Course.allowStudentNotes
└── migrations/<UTC timestamp>_courses_lessons/migration.sql

supabase/tests/002_course_policies.test.sql
tests/e2e/us1-create-course · us2-build-lessons · us3-delete-restore · us4-student-reads .spec.ts
tests/e2e/fixtures/courses.ts        # seed courses, assignments, progress, submissions
vercel.json                          # crons: /api/cron/purge daily
```

**Structure Decision**: A single Next.js app, as in 001, with everything for this spec under `src/features/courses`. The shared renderer goes in `src/components/shared` because the student reader and the admin editor both use it, and 004 submissions will too. Admin and student detail and editor screens sit outside the `(tabs)` route groups so they render full screen. That means moving the student tab pages into `src/app/s/(tabs)/`.

**Documentation updates in this feature**:
- `docs/data-model.md`: `allow_student_notes`; `can_read_lesson`; new CHECKs in §4.
- `docs/technical-spec.md`:
  - §9 / §17: daily purge via Vercel Cron.
  - §14: the CSP must allow `frame-src https://www.youtube-nocookie.com`.
  - §3: the `s/(tabs)` group.
- `.env.example`: note that `CRON_SECRET` is also used by the purge.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| `GET /api/cron/purge` has no user guard | It's called by Vercel Cron, not a person | A user guard can't apply. Mitigations: it requires `Authorization: Bearer ${CRON_SECRET}` (constant-time compare) and only deletes rows whose `deleted_at` is more than 30 days old. |
| The purge uses `SUPABASE_SECRET_KEY` to delete Storage files | Deleting files of purged content works across all admins, with no user session | Deleting `storage.objects` with SQL leaves the stored files behind (research R8). Mitigation: the same `server-only` module as 001's account deletion, called only by the purge. |
| Lesson **locking** is enforced in server code only, not RLS | Locking paces students through content they're authorized to read (research R1) | An RLS version would run an ordered "previous published lesson" lookup per row and duplicate the date rules in SQL. Authorization itself (Draft, deleted, archived-incomplete, unassigned) is still enforced in **both** layers by `can_read_lesson`. |
| Replacing three 0_init policies (`lessons_read`, `resources_read`, `lesson_files_read`) and one Storage write policy | Clarified rules (archived → completed only; files follow lesson visibility) | These are hand-written replacements in a reviewed migration, not a Prisma drop. pgTAP covers both the old allowed cases and the new denied ones. |
