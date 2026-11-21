# Quickstart: validate feature 002

How to prove Courses and Lessons works against the **dev** Supabase project. Endpoints and actions: `contracts/`. Data rules: `data-model.md`. Decisions: `research.md`.

## 1. Prerequisites

| Need | Where it comes from |
| --- | --- |
| `SUPABASE_SECRET_KEY` in `.env` | 001 task T005 (manual). Used by e2e fixtures and the purge. |
| `CRON_SECRET` in `.env` (any long random string) | already listed in `.env.example`. Protects `/api/cron/purge`. |
| E2E fixtures (`createConfirmedUser`, run-prefixed emails, teardown) | 001 task T025. If it's still open, 002's first e2e task builds it. |
| An admin, a student with an **active link** to that admin, and a `course_assignments` row | seeded by fixtures. The join/approve UI (001 US2) and the Assign UI (003) aren't needed. |

## 2. Apply and check the database

```bash
pnpm prisma migrate deploy   # applies <timestamp>_courses_lessons
pnpm prisma generate
pnpm test:db                 # pgTAP: 001, 002 (course policies, Storage), 005
pnpm test                    # Vitest: guards (incl. requireLessonOwner/Reader), lock rules, schemas, Markdown, copy, purge
```

Expected: every pgTAP and Vitest test passes. In particular, `002_course_policies.test.sql` shows students can't read Draft, deleted or unassigned content, and only completed lessons of an archived course.

## 3. Automated end-to-end

```bash
pnpm test:e2e tests/e2e/us1-create-course.spec.ts
pnpm test:e2e tests/e2e/us2-build-lessons.spec.ts
pnpm test:e2e tests/e2e/us3-delete-restore.spec.ts
pnpm test:e2e tests/e2e/us4-student-reads.spec.ts
```

## 4. Manual scenarios (phone width, 390×844)

Run `pnpm dev`, sign in as the fixture admin in one window and the fixture student in another.

| # | Story | Steps | Expected |
| --- | --- | --- | --- |
| 1 | US1.1 | Courses → New course → fill every field, Status Draft → Create | Course page opens; it's under **Drafts · 1**; the student's Courses tab doesn't show it |
| 2 | US1.3 | Course page → Make active; seed an assignment for the student | Under **Active**; the student now sees it |
| 3 | US1.2 | New course → Copy existing course → pick the course → Create | New Draft course with the same sections and lessons (all Draft) and attachments that open; no students |
| 4 | US2.1 | Course page → + Add section ×2 → + Add lesson | Editor opens with title, minutes, section, unlocks, Markdown, attachments, assignment |
| 5 | US2.5 | Type in the editor, stop for 3 s | "Saved hh:mm" in your time zone; reload keeps the text |
| 6 | US2.2 | Write headings, a table, Japanese 私は看護師です and Burmese မင်္ဂလာပါ, a YouTube URL on its own line → Preview | Renders like the student view: table, player, both scripts clear |
| 7 | US2.3 | Drag a lesson by ⋮⋮ into the other section; reload | New order and section persist; numbers renumber |
| 8 | US2.4 | Publish two lessons | The student sees them in order; the Draft one isn't listed |
| 9 | US4.2 | Lesson 2 rule "After 1"; student opens the course | Lesson 2 shows **Locked · unlocks after 1** and can't be opened; after a `lesson_progress` row (`done`) for lesson 1 is seeded, it opens |
| 10 | US4.3 | Student opens lesson 1 | Markdown, attachments and the assignment prompt render; image and audio load |
| 11 | Edge | Upload a 12 MB file; then a 4000 px photo | First rejected with a message; second uploads resized (≤ 1600 px) |
| 12 | US3.1 | Editor → 🗑 on a Published lesson with a seeded submission | Sheet lists the student and their work state; **Unpublish instead** turns it Draft |
| 13 | US3.2 | Course ⋯ → Delete course → type a wrong name, then the right one | Button enabled only for the exact name; course disappears for admin and student |
| 14 | US3.3 | Courses → Recently deleted → Restore | Course and lessons return; the student's seeded progress is intact |
| 15 | US3.4 | Archive an active course with one lesson done by the student | It moves to the student's **Archived** chip; only the completed lesson is listed and opens |
| 16 | SC-003 | As the student, request `/api/lesson-files/<id of a Draft lesson's file>/x.pdf` | 404 |

**Walkthrough 2026-11-21 (T077)**: no failures. Scenarios 1–16 are covered by the Playwright specs (us1–us4), all passing at 390×844 and 1280×800 against `pnpm build`. Still manual: scenario 11's 4000 px photo resize (the size maths is unit-tested in `upload.test.ts`, the canvas resize isn't), and §5 below, which wasn't run because it purges every expired item in the shared dev database; `purge.test.ts` covers it, scoped to its own fixtures.

## 5. Purge check

```bash
# after setting a test course's deleted_at to 31 days ago in the dev DB:
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/purge
```

Expected: `200 {"courses":1,"lessons":…,"files":…}`; the course rows and its Storage folder are gone. Without the header: `401`.

## 6. Translation review (`_review`)

Checked by script on 2026-11-21 (T072): `en`, `my` and `ja` have the same keys, the same `{placeholders}` and rich-text tags, and no 002 string is left in English. The `my` and `ja` texts were written without a native speaker, so these need one before release:

- **US3 strings (newest):** `deleteFlow.*`, `recentlyDeleted.*`, `courses.archive`, `courses.unarchive`, `courses.deleteCourse`, `courses.archivedToast`, `courses.unarchivedToast`, `courses.recentlyDeleted`.
- **Terms to confirm across all 002 screens:** Burmese "course" = သင်ခန်းစာအစုံ, "archive" = သိမ်းဆည်း, "unpublish" = ထုတ်ဝေမှု ရုပ်သိမ်း, "recently deleted" = မကြာသေးမီက ဖျက်ထားသည်များ; Japanese "unpublish" = 非公開にする, "recently deleted" = 最近削除した項目.
- **Sentences built around formatted values:** `recentlyDeleted.meta` ("{relative}に削除", "{relative} က ဖျက်ခဲ့သည်") with next-intl's relative time, and `deleteFlow.body` with the lesson number.

## 7. Performance (T075, 2026-11-21)

- **Bundles (passed)**: in the `pnpm build` output, the `@dnd-kit` chunk is referenced only by `/a/courses/[courseId]`, and the `@uiw/react-md-editor` chunk only by the lesson editor's dynamic-import manifest (`/a/courses/[courseId]/lessons/[lessonId]/edit`). Student routes load neither.
- **Lighthouse on `/s/lessons/[id]` (mobile, target ≥ 90): still to run by hand.** A headless run couldn't keep the signed-in session (the page navigated away before first paint), so no score is recorded. To run it: sign in as a student in Chrome, open a lesson, DevTools → Lighthouse → Mobile, Performance only, against `pnpm build && pnpm start`. Record the score here.

## 8. Done means

US1–US4 Playwright specs pass. pgTAP and guard tests pass. `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` are clean. Screens match screenshots 05, 09, 10 and 17–21 at phone width, apart from the documented differences (contracts/ui-routes.md "partial" notes). Spec **Status** is set to `Implemented`.
