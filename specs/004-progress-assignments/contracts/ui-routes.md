# Contract: UI routes and screens — 004

Rules for every screen: phone first (390×844), every tap target ≥ 44 px, theme tokens only, all text from the message files.

## Route layout

| Route | Change | Screenshot |
| --- | --- | --- |
| `/s/lessons/[lessonId]` | tabs Lesson / Assignment / Notes; bottom bar Focus + Mark complete; `?tab=lesson\|assignment\|notes` | `10-Lesson.png` |
| `/s/progress` | replaces the placeholder; `?view=month\|week` | `06-Progress.png` |
| `/s/today` | + streak card, weekly-goal card, Continue card above 003's sections | `04-Today.png` (partial) |
| `/s/courses` | + "Studied this week" card, progress bar and "{done} of {total}" on cards | `05-Courses.png` (partial) |
| `/s/courses/[courseId]` | + progress card under the header | `09-Course.png` (partial) |
| `/s/me` | "Weekly goal · {n} days" row → goal sheet | `11-Profile.png` (partial) |
| `/a/students` | + one progress card per linked student | `16-AdminStudents.png` (partial) |
| `/a/students/[studentId]` | **new**: To review + courses with lesson rows | none (002 course-screen layout) |
| `/a/students/[studentId]/lessons/[lessonId]` | **new**: review, Notes, Mark done / Reopen | none (`10-Lesson.png` layout) |

"Partial" means parts owned by other features are left out:
- 005: the night-shift banner on Today, "Night shift tonight" on the admin card, the Shift calendar row;
- 006: the bell, "Send a nudge", "Reminders", "Quiet hours", "My reminders";
- the later personal-courses feature: the Courses "Completed" and "Mine" chips and the + button;
- not in any spec: "active 2 h ago".

Intentional difference from `10-Lesson.png`: the assignment card reads "Draft saved · {time}" instead of "3 of 5 written". A count of sentences is specific to that one lesson and can't be worked out in general (research R7).

## Student screens

**Lesson** (`/s/lessons/[lessonId]`)
- Header as in 002: back, "{course} · Lesson n of m", title, then the due chip (003) and "{n} min".
- Tabs (shadcn `Tabs`, real `tablist`):
  - **Lesson**;
  - **Assignment**, only when the lesson has an assignment prompt;
  - **Notes · {count}** ("Notes" when the count is 0).
- **Lesson tab**:
  - 002's content and attachments.
  - Then the assignment card, which opens the Assignment tab: icon, "Assignment: {first line of the prompt}", and status "Not started" / "Draft saved · {time}" / "Submitted · {date}" / "Needs redo" (warning tone) / "Reviewed" (success tone).
- **Assignment tab**:
  - The prompt (rendered Markdown).
  - Editable status (no submission, Draft, Needs redo):
    - `MdTextarea` with 44 px toolbar buttons;
    - an image strip with up to 5 thumbnails, each with a remove button (`aria-label` "Remove {name}"), and "Add photo" (`input type=file accept="image/*" multiple`);
    - the line "Saving…" / "Draft saved · 21:04";
    - the primary button **Submit**.
  - Read-only status (Submitted, Reviewed): the rendered submission with its images, and the status chip.
  - Review comments below: avatar, name, time, text.
  - Needs redo shows a warning banner, "{admin} asked for a redo", above the editor.
  - Opened through `submission_required`: a banner at the top, "Submit your assignment to complete this lesson".
- **Notes tab**: the thread, oldest first, with my messages on the right. Below it a textarea (1–2000 characters, live counter after 1800) and **Send**. Empty state: "Ask a question or leave a note for {admin}."
- **Bottom bar** (sticky, both buttons ≥ 44 px):

  | State | Left | Right |
  | --- | --- | --- |
  | not done, no timer | **Focus 15** + ▾ menu (15 min / 25 min) | **Mark complete** (primary, check icon) |
  | timer running on this lesson | **mm:ss · Stop** (`aria-live="polite"` announces each minute, not each second) | **Mark complete** |
  | timer running on another lesson | "Focus running · {lesson}" (link) | **Mark complete** |
  | done | "Done ✓" + **Undo** | **Next lesson ›** (when there is one) |
  | done by the Admin | "Marked done by {admin}" + **Undo** | **Next lesson ›** |

- Mark complete on a lesson with "submit before complete" and no submission switches to the Assignment tab and shows the banner. No error toast.
- When a timer reaches 0 it stops itself and shows a toast "Focus done · 15 min added". It also vibrates if the device supports it and the user hasn't asked for reduced motion.

**Progress** (`/s/progress`)
- Title "Progress" and a `Segmented` Week / Month toggle (Month is the default), kept in the URL.
- Three stat cards in one row:
  - "{n}" (accent colour) · "Day streak" · "Best: {n}";
  - "{h} h {m} m" · "Studied" · "{n} study days";
  - "{n}" · "Lessons done" · "+{d} vs {Oct}" (success) / "−{d} vs {Oct}" (muted) / "Same as {Oct}". In Week view the comparison reads "vs last week".
- **Month**:
  - A card with "{Month YYYY}" and "Weekly goal: {n} of {goal} days".
  - `CalendarMonth` (003) with heat cells: past days filled at their level, today outlined, future days dashed.
  - Legend "Less ■■■■■ More".
  - Each cell's accessible name is "{date}, {n} min studied" (or "no study").
- **Week**: `WeekBars`, with a label per day "M T W T F S S". Today is bold. Bar height is relative to the week's maximum; an empty day gets a 4 px stub.
- **Courses · finish forecast**: one row per active course: title, percent, a bar in the course accent, and the forecast line.

  | Forecast | Text | Tone |
  | --- | --- | --- |
  | `on_track` | "On track · finishes ~{24 Dec}, due {31 Dec}" | success |
  | `behind` | "Behind · ~{28 Jan} at this pace, due {15 Jan}" | warning |
  | `no_deadline` | "No deadline · ~{n} lessons left" | muted |
  | `no_pace` | "No study in the last 2 weeks · {n} lessons left" | muted |
  | `finished` | "Finished" | success |
  | `empty` | percent "—", no bar fill, "No lessons yet" | muted |

- Empty state (no assigned courses): 002's "Your admin hasn't assigned a course yet."

**Today** (above 003's Overdue and Due today)
- Two cards side by side:
  - flame icon, "{n} days", "Study streak";
  - 7 dots (filled = active day Mon–Sun), "{n} of {goal}", "Study days this week".
- **Continue** card: "{course short} · Lesson {n}", "{course} · {done} of {total} done", a progress bar, and a round play button (`aria-label` "Continue {lesson}") linking to the lesson. Hidden when `continue` is null.

**Courses**
- The "Studied this week" card goes above the chips:
  - "Studied this week", "{h} h {m} m", and on the right "{n} lessons done" (success);
  - `WeekBars` below.
- Each active course card adds a progress bar in the course accent, "{percent}%" at top right ("—" when null), and "{done} of {total}" before 003's "· due {date}".

**Course screen**: a progress card under the header with "{percent}%", a bar, and "{done} of {total} lessons".

**Me**: the "Weekly goal · {n} days" row opens a bottom `Sheet` with 7 buttons 1–7, the current one selected, and "Days a week you want to study". Saving closes the sheet.

## Admin screens

**Students** (`/a/students`): for each linked student, under 001's invite and request cards:
- **Header row**:
  - avatar initial and name;
  - a "{n} overdue" chip in the danger tone when n > 0;
  - a "{n} to review" chip in the primary tone, which links to `/a/students/[id]`.
- **Tiles**: three tiles, "{n} · Day streak", "{h} h {m} m · This week" and "{n} · Lessons done", the last two in the student's own local week.
- **Course rows**: one per active course, with title, bar and "{percent}%".
- **Link**: the whole card links to `/a/students/[id]` (one link; its accessible name is the student's name).
- **Live updates**: through Realtime (research R10).
- **Empty state**: 001's.

**Student** (`/a/students/[studentId]`)
- Back, then name and "{city} time" (`cityOf`, 003).
- "To review · {n}": rows with lesson title, course and "submitted {relative}", linking to the review screen.
- One section per course: title, bar, percent. Lesson rows show the number circle (green check when done), the title, and a submission chip: Submitted (primary), Needs redo (warning), Reviewed (success). Rows link to the review screen.

**Lesson review** (`/a/students/[studentId]/lessons/[lessonId]`)
- Back, then "{student} · {course} · Lesson n of m" and the title.
- Tabs **Assignment** / **Notes · {count}**.
- **Assignment tab**:
  - The prompt, collapsed to 3 lines with "Show more".
  - The submission rendered with its images (tap opens the full image) and "Submitted {date, time}" in the **student's** time, plus the Admin's time with `TimeBoth` when the zones differ (constitution IV).
  - Review comments.
  - A comment textarea, then **Needs redo** (outline, warning) and **Reviewed** (primary).
  - No submission: "{student} hasn't submitted yet". A Draft is never shown.
- **Notes tab**: as on the student's screen.
- **Bottom bar**:
  - **Mark done** when the lesson isn't done;
  - "Done · {date} by {name}" + **Reopen** when it is. The date is in the student's zone, with `TimeBoth` when the Admin's zone differs (constitution IV).
  - Hidden when the course isn't Active.

## Shared components

| Component | Path | Used by |
| --- | --- | --- |
| `WeekBars` (new) | `src/components/shared/week-bars.tsx` | Progress week (004), Courses card (004) |
| `ProgressBar` (new) | `src/components/shared/progress-bar.tsx` (`role="progressbar"`, accent prop) | Courses, Course, Progress, Today, Admin cards |
| `MdTextarea` (moved from `features/courses/components`) | `src/components/shared/md-textarea.tsx` | lesson editor (002), Assignment tab (004) |
| `CalendarMonth` (003) | existing; + a `renderDay` slot for heat cells if the badge slot isn't enough | Plan month (003), Progress (004) |
| `Tabs` (shadcn, generated) | `src/components/ui/tabs.tsx` | Lesson, Lesson review |

Feature components in `src/features/progress/components/`:
- Student: `LessonWorkTabs`, `LessonBottomBar`, `FocusButton`, `AssignmentEditor`, `ImageStrip`, `SubmissionView`, `CommentList`, `NoteComposer`, `ProgressView`, `StatCards`, `HeatCalendar`, `ForecastList`, `StreakCard`, `WeekGoalCard`, `ContinueCard`, `StudiedWeekCard`, `WeeklyGoalSheet`.
- Admin: `StudentProgressCard`, `StudentDetail`, `LessonReview`, `ReviewBar`.

## Message namespaces (new)

`lessonWork` (tabs, bottom bar, focus, assignment card), `submission`, `notes`, `progress` (stats, calendar legend, forecast), `todayProgress` (streak, goal, Continue), `weeklyGoal`, `adminStudents` (card, detail, review), the new `notices.*` keys (submitted, reviewed, needs redo), and the new `errors.*` and `validation.*` keys (contracts/server-actions.md). All three languages: `en`, `my`, `ja`.
