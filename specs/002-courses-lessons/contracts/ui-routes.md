# Contract: UI routes and screens — 002

Phone first (390×844), checked at 1280×800. All text from `src/i18n/messages/{en,my,ja}.json`; colours from theme tokens (course colours: `--course-<key>`, `--course-<key>-soft`); tap targets ≥ 44 px; icon-only buttons have `aria-label`. Proxy rules are unchanged from 001 (`/a/**` admins, `/s/**` students with an active link).

## Route layout

| Route | File | Shell |
| --- | --- | --- |
| `/a/courses` | `src/app/a/(tabs)/courses/page.tsx` (replaces the placeholder) | admin tab bar |
| `/a/courses/new` | `src/app/a/courses/new/page.tsx` | full screen, no tab bar |
| `/a/courses/deleted` | `src/app/a/courses/deleted/page.tsx` | full screen |
| `/a/courses/[courseId]` | `src/app/a/courses/[courseId]/page.tsx` | full screen |
| `/a/courses/[courseId]/edit` | `src/app/a/courses/[courseId]/edit/page.tsx` | full screen |
| `/a/courses/[courseId]/lessons/[lessonId]/edit` | `src/app/a/courses/[courseId]/lessons/[lessonId]/edit/page.tsx` | full screen; split view ≥ 1024 px |
| `/s/courses` | `src/app/s/(tabs)/courses/page.tsx` | student tab bar |
| `/s/courses/[courseId]` | `src/app/s/courses/[courseId]/page.tsx` | full screen |
| `/s/lessons/[lessonId]` | `src/app/s/lessons/[lessonId]/page.tsx` | full screen |

The student tab pages (`today`, `courses`, `progress`, `shifts`, `me`) move into `src/app/s/(tabs)/` with a layout holding `StudentNav`. `src/app/s/layout.tsx` keeps the role and active-link checks for every `/s/**` route (research R12).

## Admin screens

| Route | Screenshot | Contents in 002 |
| --- | --- | --- |
| `/a/courses` | `17-AdminCourses` | "Courses" + "New course" button; search field (title, level tag); chips **Active · n**, **Drafts · n**, **Archived · n**. Course card: icon tile in its colour, title, "{n} lessons · {m} sections", student initials + "{k} students · avg {p}%" (only when assignments exist). ⋯ menu: Open lessons, Edit details, Duplicate as template, Archive (Active) or Unarchive (Archived), Delete course. "Assign to students" arrives with 003. Footer link "Recently deleted". Empty states per chip. |
| `/a/courses/new` | `19-AdminCourseForm` | Cancel · "New course". Toggle **Blank course / Copy existing course** (Copy shows a picker of own courses and prefills the fields with "{title} (copy)"). Icon tile (opens the icon sheet) + Title; Colour swatches (6, radio group); Description; Target finish (date) + Level / tag; checkboxes "Unlock lessons in order", "Students can add personal notes"; Status segmented "Draft · only you see it" / "Active". Sticky "Create and add lessons" → `/a/courses/[id]`. |
| `/a/courses/[courseId]/edit` | `19-AdminCourseForm` | Same form, prefilled, title "Edit course", button "Save". No Blank/Copy toggle. The Status control is hidden for Archived courses (use Unarchive on the course page). A note under "Unlock lessons in order" says that changing it updates every lesson's unlock setting. "Delete course" at the bottom (dialog below). |
| `/a/courses/[courseId]` | `18-AdminCourse` | Back · "Edit details". Icon, title, status chip (Active / Draft / Archived), "{n} lessons · target {date}". Draft banner "Only you can see this course" + "Make active". Archived banner + "Unarchive". Student strip (initials + "{name} {p}%") only when assignments exist; the Assign button arrives with 003. Sections: heading "{title} · {n} lessons", ⋯ (Rename, Move up, Move down, Delete section when empty), collapsible. Lesson rows: ⋮⋮ drag handle, "{number} · {title}", "{min} min · assignment / audio / not visible to students", chip Published or Draft; swipe left for Edit and Delete; tap opens the editor. "+ Add lesson" per section, and in the untitled group shown first when the course has no sections or has lessons without a section. "+ Add section" (inline title field). Hint: "Drag ⋮⋮ to reorder lessons or move them between sections. Swipe a lesson left for Edit and Delete." |
| `/a/courses/[courseId]/lessons/[lessonId]/edit` | `20-AdminLessonEdit` | Back · "Edit lesson" · "Saved hh:mm" / "Saving…" / "Not saved · Retry". Title; Minutes; Section (native select, includes "No section"); Unlocks (native select: "After {n}" for the previous lesson, "Always open", "On a date…" → date field). Editor card: Write / Preview segmented control + toolbar H, B, I, list, image, audio; byte warning above 200 KB. Attachments: chips with name and ×, "+ File or link" (sheet: upload a file, or paste a link with a title). "Assignment for the student" textarea. Checkbox "Submit assignment before marking complete". Bottom bar: 🗑 (delete sheet), then **Save draft** + **Publish** for Draft lessons, or **Unpublish** + **Save** for Published ones. |
| Delete lesson sheet | `21-AdminDelete` | Trash icon, "Delete “{title}”?", "Lesson {n} in {course}. Students' work on it is deleted too after 30 days in Recently deleted." Assigned students with their work state (data-model.md › Student work), shown only when there are any. Info box (Published lessons only): "Want to keep their work? **Unpublish** hides the lesson from students and keeps everything." Buttons: **Delete lesson** (destructive), **Unpublish instead** (Published only), Cancel. Footnote: "Deleting a whole course asks you to type its name first." Copy is gender-neutral ("their"), unlike the screenshot. |
| Delete course dialog | — | AlertDialog: "Delete {title}?", "Students lose access. You can restore it from Recently deleted for 30 days." Text field "Type the course name to confirm". **Delete course** stays disabled until the trimmed text matches. |
| `/a/courses/deleted` | — | Back · "Recently deleted". Two lists: Courses and Lessons ("in {course}"). Each row: "Deleted {relative time} · removed for good on {date}" (viewer's time zone) and a **Restore** button. Empty state. |

## Student screens

| Route | Screenshot | Contents in 002 |
| --- | --- | --- |
| `/s/courses` | `05-Courses` (partial) | "Courses". Chips **Active · n** and **Archived · n** (Archived only when there are any). Card: icon tile, title, "{n} lessons · finish by {date}" (target date, if any). The weekly study card, progress bars, Completed and Mine chips and the + button come with 004 and the later personal-courses feature. Empty state: "Your admin hasn't assigned a course yet." |
| `/s/courses/[courseId]` | `09-Course` (partial) | Back. Title; "Assigned by {admin}" + " · finish by {date}". Archived: banner "Archived · completed lessons stay available". Section headings; lesson rows: number circle, title, "{min} min", plus "unlocks after {n}" or "opens {date}" for locked rows with a **Locked** chip. Open rows link to the lesson; locked rows are `aria-disabled` and not links. The progress card and due / overdue / done chips come with 003 and 004. |
| `/s/lessons/[lessonId]` | `10-Lesson` (partial) | Back. "{course} · Lesson {n} of {m}"; title; "⏱ {min} min". Markdown body (shared `Markdown`). Attachments list (file: name + size, opens `/api/lesson-files/...`; link: opens in a new tab). Assignment card with the prompt text, read only (writing and submitting come with 004). On 403 `lesson_locked`: "This lesson isn't open yet" + reason + back to the course. The Lesson / Assignment / Notes tabs, the overdue chip, Focus and Mark complete come later. |

## Shared components

| Component | Where | Notes |
| --- | --- | --- |
| `Markdown` | `src/components/shared/markdown.tsx` | research R4/R5; used by the student lesson page and the editor preview |
| `CourseIcon` | `src/features/courses/components/course-icon.tsx` | tile with glyph in course colour tokens; sizes sm / md / lg |
| `StatusChip` | `src/components/shared/status-chip.tsx` | Published / Draft / Active / Archived / Locked; tokens only |
| `LessonEditor` | `src/features/courses/components/lesson-editor.tsx` | dynamic import of MDEditor, autosave hook |
| `SortableLessonList` | `src/features/courses/components/sortable-lessons.tsx` | dnd-kit multi-container + swipe actions |

## Message namespaces (new)

`courses` (admin list, card menu), `courseForm`, `courseDetail`, `lessonEditor`, `deleteFlow`, `recentlyDeleted`, `studentCourses`, `lessonView`, `markdown` (YouTube title, audio label), plus new `errors.*` keys. Same keys in `en`, `my`, `ja`; Burmese and Japanese drafts flagged for native review, as in 001.
