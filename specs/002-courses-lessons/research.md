# Research: Courses and Lessons (002)

Phase 0 of the plan. Each item: decision, rationale, alternatives. Built on `prisma/migrations/0_init` (tables, RLS, Storage buckets, guards already exist) and the spec as clarified on 2026-11-21. Library versions checked against the npm registry on 2026-11-21.

## R1. Open / Locked: app code, not SQL

- **Decision**: A pure function `computeLocks()` in `src/features/courses/lock.ts` decides Open or Locked for each lesson a student can see. Student Route Handlers call it; `GET /api/lessons/[id]` and `GET /api/lesson-files/...` refuse a locked lesson with 403 `lesson_locked`.
  - **Course order**: the "no section" group first, then sections by `position`; inside a group, lessons by `position` (data-model.md › Ordering).
  - **after_previous**: locked while the previous *Published, non-deleted* lesson in course order is not done. The first visible lesson is always open. If the previous lesson is locked, it can't be done, so this one stays locked too.
  - **on_date**: locked while `todayIn(student.timezone) < date`. `todayIn` (`src/lib/time.ts`) formats `now` with `Intl.DateTimeFormat('en-CA', { timeZone })`. The comparison is between two `YYYY-MM-DD` strings, so the lesson opens at 00:00 in the student's own zone.
  - **none**: always open.
  - **Done** means `lesson_progress.status = 'done'`. 004's "Mark complete" writes those rows; 002 tests insert them directly.
- **Rationale**: Locking paces the student through lessons they are already allowed to read; it isn't a privacy rule. Finding "the previous published lesson" inside an RLS policy would re-run an ordered lookup for every row read. The constitution leaves the choice between SQL and app code for lesson status to the plan, and 003's status chips (FR-005) can reuse the same function. Unit tests cover every rule before the code exists (constitution III).
- **Alternatives**: a SQL function `lesson_unlocked()` used in RLS. Rejected: costly per-row ordered lookups, and the date rules would be duplicated in SQL and TypeScript. Locking only in the UI. Rejected: the spec says a locked lesson "cannot be opened". This exception to "both layers apply the same rules" is listed in plan.md › Complexity Tracking.

## R2. Archived courses and Draft content: a lesson-level read rule in both layers

- **Decision**: New SQL function `can_read_lesson(p_lesson)`, mirrored by a new guard `requireLessonReader(lessonId)`. A user can read a lesson when they own its course, **or** all of the following hold: the lesson is Published and not deleted, `can_read_course(course)` is true, and either the course is not Archived or the student has `lesson_progress.status = 'done'` for that lesson. Linked admins reading a student's personal course keep their existing access (US5 is deferred). The function replaces the conditions in the `lessons_read` and `resources_read` policies and in the Storage read policy for `lesson-files`.
- **Rationale**: Clarification 2026-11-21: an archived course keeps only completed lessons readable. Today's policies let an assigned student read every Published lesson of an Archived course. They also let a student read any file in the course's Storage folder, including files of Draft lessons, if the path is known. SC-003 asks for zero exposure of Draft and deleted content.
- **Alternatives**: hide archived lessons in the UI only. Rejected: the second security layer would be weaker than the spec. Keep course-level Storage paths. Rejected: files of Draft lessons would be readable.

## R3. Files: Storage layout, uploads and reading

- **Decision**:
  - **Path**: `lesson-files/<course_id>/<lesson_id>/<uuid>.<ext>`. The write policy also checks that the lesson belongs to that course, so read checks can trust the second folder (data-model.md › Storage).
  - **Upload**: the browser uploads with supabase-js and the user's token (CLAUDE.md: supabase-js for Storage uploads). Before uploading, the client rejects anything over 10 MB or outside the allow-list. Images are resized to at most 1600 px on the long edge (`createImageBitmap` + canvas, WebP or JPEG at 0.82). After the upload, the Server Action `addLessonResource` records the row. The bucket's own `file_size_limit` (10 MB) and `allowed_mime_types` enforce the same limits on the server.
  - **Allow-list**: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/ogg`, `audio/wav`, `audio/webm` (technical spec §14: images, PDF, audio).
  - **Reading**: Markdown and attachment lists use a stable app URL, `/api/lesson-files/<resourceId>/<file name>`. That Route Handler runs the guard (owner, or reader of an unlocked lesson), creates a 1-hour signed URL with the user's server Supabase client (so Storage RLS applies too) and answers `302`. The file name in the URL is for display and type detection only.
- **Rationale**: FR-008 requires a private bucket. Signed URLs written into Markdown would expire. The stable URL can be cached by the service worker in 008. A redirect keeps large audio off Vercel functions and lets the browser use range requests.
- **Alternatives**: a public bucket (breaks FR-008); streaming bytes through a Route Handler (function time and size limits, no range requests); storing signed URLs in Markdown (they expire).

## R4. One Markdown renderer for preview and students

- **Decision**: `src/components/shared/markdown.tsx` uses `react-markdown` 10.1 + `remark-gfm` 4.0 + `rehype-sanitize` 6.0 (default GitHub schema), with `skipHtml` on. Component overrides:
  - `img` renders `<audio controls preload="none">` when the target's file name ends in `.mp3`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.wav` or `.webm`; otherwise a lazy `<img>` that fits the column.
  - `p` whose only child is a YouTube link renders `YouTubeEmbed` (R5).
  - `a`: external links open in a new tab with `rel="noopener noreferrer nofollow"`.
  - `table` sits in a horizontally scrollable wrapper; code blocks wrap and use the mono font. No syntax highlighting in 002.
  - Text inherits the app font stack (Noto Sans JP, Noto Sans Myanmar fallbacks) with line-height 1.7 so Burmese stacked marks don't clip.
- The lesson editor's preview is `components.preview = (source) => <Markdown source={source} />`, so admins preview through the same component students see. SC-002 is checked by a Vitest test on a fixture set: Japanese, Burmese, a table, code, an image, audio, YouTube and unsafe HTML. The test snapshots the `Markdown` output and asserts that the editor preview renders identical HTML.
- **Rationale**: FR-007 (sanitized, no raw HTML). Spec edge case: unsafe HTML is stripped, which `skipHtml` does. Constitution VII names these libraries.
- **Alternatives**: `rehype-raw` with a custom schema (allows HTML, more attack surface); MDEditor's built-in preview (different HTML from the student view, so SC-002 fails).

## R5. YouTube embeds

- **Decision**: `src/components/shared/youtube.ts` recognises `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID` and `youtube.com/embed/ID` (ID = `[A-Za-z0-9_-]{11}`), keeping a start time from `t` or `start`. Only a link that is alone in its paragraph becomes `<iframe src="https://www.youtube-nocookie.com/embed/ID">` with `loading="lazy"`, `allow="encrypted-media; picture-in-picture; fullscreen"`, `referrerPolicy="strict-origin-when-cross-origin"` and a translated `title`. When `navigator.onLine` is false the component shows a plain link instead. The sanitizer never has to allow `iframe`, because our component creates it after sanitizing.
- **Follow-up**: when a Content-Security-Policy is added (technical spec §14), it must include `frame-src https://www.youtube-nocookie.com`.
- **Alternatives**: allowing `<iframe>` in Markdown HTML (raw HTML is disallowed); thumbnail-only cards (an extra tap, and the spec asks for YouTube to render).

## R6. Lesson editor and autosave

- **Decision**:
  - `LessonEditor` wraps `@uiw/react-md-editor` 4.2, loaded with `next/dynamic` and `ssr: false`. Our own Write / Preview segmented control drives `preview="edit" | "preview"` on phones; at ≥ 1024 px the editor uses `"live"` split view (constitution V). The toolbar keeps heading, bold, italic and list, plus custom **image** and **audio** commands that open the file picker, upload (R3) and insert `![name](/api/lesson-files/<id>/<name>)`. `data-color-mode` follows next-themes.
  - **Autosave**: react-hook-form watches the fields. 3 s after the last change, `saveLesson` is called with all editable fields. The mutation runs with `scope: { id: 'lesson:<id>' }` (TanStack Query v5 runs mutations in the same scope one after another). Pending changes are also saved when the page is hidden, on Back, and before Publish / Unpublish.
  - **Conflicts**: last write wins; there is no version check (spec edge case). A save to a Published lesson is live at once (clarification 2026-11-21).
  - **Status**: "Saved hh:mm" comes from the server's `updatedAt`, formatted in the viewer's time zone. On failure the editor shows "Not saved · Retry". While a save is pending or failed, leaving the page asks for confirmation (`beforeunload` plus an in-app confirm on Back).
  - **Size**: the editor counts UTF-8 bytes. Above 200 KB it shows the warning and pauses autosave until the text is shorter. The database CHECK `octet_length(content_md) <= 204800` is the hard limit, and Zod applies the same limit.
- **Alternatives**: a server-side working copy for Published lessons (rejected in clarification); saving on every keystroke (too many writes on mobile networks).

## R7. Ordering, drag and drop, swipe

- **Decision**:
  - `position` counts from 0 within each group (a section, or "no section"), with no gaps. The server renumbers every affected group after reorder, move, delete and restore (spec edge case: order conflicts resolved by a server recompute).
  - `reorderLessons` receives the complete desired order of the affected groups, checks that every lesson belongs to the course, and writes all positions in one transaction.
  - A stale list never drops lessons: unlisted lessons of an affected group follow the listed ones in their current order, and a listed lesson now in another group moves to the listed group (last write wins).
  - Lesson numbers ("13 · Particles…") are computed, not stored. Admins number every non-deleted lesson; students number the ones they can see. The two can differ while Draft lessons sit in between.
  - Drag and drop: `@dnd-kit/core` 6.3 + `@dnd-kit/sortable` 10, multi-container so lessons can move between sections. Pointer and touch sensors start only from the ⋮⋮ handle (`setActivatorNodeRef`), so page scrolling isn't hijacked. A keyboard sensor with `sortableKeyboardCoordinates` and translated screen-reader announcements covers keyboard users.
  - Swipe left for Edit / Delete (screenshot 18) uses pointer events, with no extra library. Neither action needs a swipe: tapping a lesson opens the editor, which has Delete.
  - Sections: add, rename, move up/down (⋯ menu), collapse. A section can be deleted only when it has no non-deleted lessons.
- **Alternatives**: one position across the whole course (moving a lesson between sections renumbers everything, and section order and lesson order can disagree); fractional positions (precision drift; the spec asks for a server recompute anyway); `@dnd-kit/react` (still 0.x).

## R8. Soft delete, restore, purge

- **Decision**:
  - Deleting a course sets `courses.deleted_at` and leaves its lessons alone. Restoring clears it, and the lessons come back as they were. Deleting a lesson sets `lessons.deleted_at`. Progress, submissions and deadlines stay until the purge (FR-006, clarified).
  - "Recently deleted" lists deleted courses, plus individually deleted lessons whose course is not deleted, from the last 30 days. Lessons of a deleted course come back with the course.
  - A restored lesson returns to its old position and its group is renumbered (ties broken by `updatedAt`). If its section was deleted meanwhile, it joins "no section".
  - Restoring after 30 days fails with `restore_expired`, even if the purge hasn't run yet.
  - **Purge**: a Vercel Cron job calls `GET /api/cron/purge` once a day. Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set, and daily jobs work on every plan. The handler calls `purgeExpired(now)` (`src/features/courses/purge.ts`), which:
    1. finds courses and lessons deleted more than 30 days ago;
    2. removes their Storage files (`lesson-files` prefixes, plus the `submissions` attachment paths of affected submissions) with the server-only secret-key client;
    3. then hard-deletes the rows. FK cascades remove sections, lessons, resources, progress, submissions and deadlines.

    If removing files fails, the rows stay and the next run retries, so the job is idempotent.
- **Rationale**: Deleting `storage.objects` rows with SQL leaves the stored files behind, because Supabase requires the Storage API for deletes. So a pure pg_cron SQL purge would leak files. The constitution also prefers Route Handlers to Edge Functions.
- **Alternatives**: pg_cron + pg_net calling the same route (works too, but needs the deployed URL and a Vault secret; Vercel Cron keeps the schedule in the repo); cascading `deleted_at` to lessons on course delete (restore can't tell which lessons were deleted on their own).

## R9. Copying a course

- **Decision**: One action, `duplicateCourse`, serves both "Copy existing course" (New course form) and "Duplicate as template" (⋯ menu).
  1. In one transaction, insert the new course (form values override the source's), its sections, its non-deleted lessons as **Draft**, and resource rows. New ids are generated in the app, and the Markdown is rewritten from `/api/lesson-files/<old resource id>/` to the new ids.
  2. Copy each stored file to its new path with the user's server Storage client (`copy`, at most 5 at a time). Storage RLS sees the caller own both courses.
  3. If any copy fails, hard-delete the new course and the files already copied, and return `copy_failed`.

  Assignments, progress, deadlines and submissions are never copied. "Duplicate as template" names the copy "{title} (copy)", makes it a Draft and opens it.
- **Rationale**: Clarification: attachments are copied with the files duplicated, because file access is checked per course folder. Inserting the rows first lets the Storage insert policy (`owns_course`) pass with the user's own token, so no secret key is needed.
- **Alternatives**: sharing files between courses (breaks per-course access and purge); copying with the secret-key client (widens the secret-key exception for no gain).

## R10. Admin course list

- **Decision**: One `GET /api/admin/courses` returns every non-deleted course the admin owns (all statuses), with lesson and section counts, assigned students (active `course_assignments`; empty until 003) and average progress. Average progress is the mean of `course_progress.percent` over assigned students, read with a typed `$queryRaw`, and null when nobody is assigned. Chips (Active · n / Drafts · n / Archived · n) and search run on the client. Search matches title and level tag, case-insensitive, after NFKC normalisation so full-width and half-width Japanese match.
- **Rationale**: An admin has dozens of courses, not thousands. One cached list makes search and chip switches instant and is easy to invalidate.
- **Alternatives**: server-side `?status=&q=` (the technical spec §7 example): more requests and cache keys for no gain at this size.

## R11. Course colour, icon, dates

- **Decision**:
  - **Colour**: six keys, `indigo`, `teal`, `rust`, `berry`, `green`, `slate` (screenshot 19), in `courses.color` with a new CHECK constraint. Each maps to `--course-<key>` (glyph) and `--course-<key>-soft` (tile) tokens in `globals.css` for light and dark mode. `src/app/theme-contrast.test.ts` checks glyph-on-tile contrast ≥ 4.5:1.
  - **Icon**: exactly one grapheme of at most 2 code points, checked with `Intl.Segmenter` in Zod; the existing DB CHECK is `char_length(icon) <= 2`. The picker sheet has a text field plus suggestions: 文 漢 字 聞 話 読 書 音 📚 ✏️.
  - **Level tag**: free text, ≤ 20 characters.
  - **Target date**: native `<input type="date">`, stored as `date`, shown with next-intl date formatting. It's a calendar date, so no time-zone conversion.
- **Alternatives**: free hex colours (break theme tokens and contrast rules, constitution V); a curated emoji-only picker (Japanese kanji icons are the main use).

## R12. What students see in 002

- **Decision**: `src/features/courses/student-repo.ts` builds three views:
  - **Course list**: courses assigned to the student, not deleted, Active or Archived.
  - **Course detail**: sections and visible lessons, each Open or Locked with the reason. For an Archived course, completed lessons only.
  - **Lesson**: content, attachments, assignment prompt and "Lesson n of m".

  Assignments come from 003 and completions from 004, so tests seed `course_assignments` and `lesson_progress` rows directly. Students also need an active link (001 layout rule), which tests seed as well.
- **Student shell**: course detail and the lesson reader are full-screen without the tab bar (screenshots 09, 10). The student tab pages move into a `src/app/s/(tabs)/` route group, the same pattern as `src/app/a/(tabs)/`.

## R13. Errors

- **Decision**: Add `HttpError(status, code)` to `src/lib/http.ts`, so handlers can answer 403 `lesson_locked`. Today only 404 `NotFound` carries a custom code. Server Actions keep using `fail(code)`. New codes are listed in contracts/server-actions.md, each with an `errors.<code>` message in en, my and ja.

## R14. Dependencies

| Package | Version | Note |
| --- | --- | --- |
| `react-markdown` | 10.1.0 | peer `react >= 18` |
| `remark-gfm` | 4.0.1 | tables, autolinks, task lists |
| `rehype-sanitize` | 6.0.0 | default schema |
| `@uiw/react-md-editor` | 4.2.4 | peer `react >= 16.8`; client-only via `next/dynamic` |
| `@dnd-kit/core` / `sortable` / `utilities` | 6.3.1 / 10.0.0 / 3.2.2 | peer `react >= 16.8` |
| shadcn components | — | `checkbox`, `toggle-group`, `collapsible` (native `<select>` and `<input type="date">` for mobile pickers) |

No date library yet: `Intl` covers "today in a time zone". `date-fns` and `@date-fns/tz` arrive when 003 or 005 needs date arithmetic.

## R15. Tests

- **pgTAP** (`supabase/tests/002_course_policies.test.sql`): owner reads and writes; another admin can't. Students: an assigned student reads Published lessons of an Active course but not Draft or deleted lessons, not lessons of a Draft or unassigned course, and only completed lessons of an Archived course. The same cases for `lesson_resources` and for Storage objects (fixture rows inserted into `storage.objects`). Also the new CHECK constraints and the `allow_student_notes` default.
- **Guards** (`src/server/auth/guards.test.ts`): `requireLessonOwner` and `requireLessonReader` with the same allowed and denied cases as pgTAP.
- **Vitest unit**, written first: `lock.ts`, `schemas.ts` (icon grapheme, unlock-rule union, content byte limit), `youtube.ts`, the Markdown snapshot and preview equality (SC-002), Markdown id rewriting for copies, position renumbering, and purge selection (against the dev database, with an injected `now`).
- **Playwright** at 390×844, one spec per user story (US1–US4), using the 001 e2e fixtures (001 task T025) to create users, links, assignments and progress rows. Uploaded test files sit under test-course prefixes and are removed in global teardown.

## Sources
- react-markdown README: HTML handling (`skipHtml`), `components` overrides.
- rehype-sanitize README: default GitHub schema.
- @uiw/react-md-editor README: `preview` modes, `components.preview`, custom `commands`, `data-color-mode`.
- dnd-kit docs: sortable multiple containers, `setActivatorNodeRef`, keyboard sensor and announcements.
- TanStack Query v5 docs: mutation `scope` (serial mutations).
- Supabase docs: Storage access control (RLS on `storage.objects`, `storage.foldername`), `createSignedUrl`, `copy`, bucket `file_size_limit` / `allowed_mime_types`, deleting objects through the Storage API.
- Vercel docs: Cron Jobs (`vercel.json` `crons`, `CRON_SECRET` bearer header, daily jobs on all plans).
