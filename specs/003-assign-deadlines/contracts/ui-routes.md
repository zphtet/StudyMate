# Contract: UI routes and screens — 003

Phone first (390×844); every tap target ≥ 44 px; theme tokens only; all text from message files.

## Route layout

| Route | Change | Screenshot |
| --- | --- | --- |
| `/a/courses/[courseId]` | students card (avatars + names) with **Assign** button (Active courses only) → `AssignSheet` | `18-AdminCourse.png`, `23-AdminAssign.png` |
| `/a/plan` | replaces the placeholder; `?student=<id>&week=<monday>&view=week\|month` | `22-AdminPlan.png` |
| `/s/today` | replaces the placeholder: Overdue + Due today | `04-Today.png` (partial) |
| `/s/courses` | course cards gain "due {date}" / "no deadline" and red "· N overdue" | `05-Courses.png` (partial) |
| `/s/courses/[courseId]` | header "Assigned by {admin} · finish by {date}"; lesson chips and detail lines | `09-Course.png` (partial) |

"Partial" = parts owned by other features stay out: 004 (progress %, bars, streak/goal cards, Continue, Done counts card), 005 (night-shift banner), 006 (bell).

Intentional differences from `22-AdminPlan.png`, both set by the spec: clash text uses the student's name ("May is on shift then", FR-014) where the mock-up says "She"; and time outside waking hours is drawn as Sleep (FR-009), where the mock-up leaves the night pale.

## Admin screens

**Students card + Assign sheet** (`AssignSheet`, bottom `Sheet`; side sheet ≥ 1024 px)
- Title "Assign course", subtitle "{course} · pick any linked students", count "Students · N of M selected".
- One card per linked student: checkbox, avatar initial, name, city of their zone (`cityOf()`, research R3), and when ticked a `DueField` (research R4) in **that student's** zone with `TimeBoth` beside it.
- Inline warnings under a `DueField`: "Already overdue"; "{name} is on shift then" / "{name} is asleep then" + "Move to {day time}" (clash endpoint, debounced).
- Switches: "Unlock lessons in order" (+ hint "Applies to every student of this course"), "Add default reminders" (default on), "Notify students now" (default off).
- Primary button "Assign to N students" (N = ticked). When the save would unassign someone, an `AlertDialog` first: "Unassign {names}? Their progress is kept."
- Empty state (no linked students): "No linked students yet" + link to the invite screen (001).

**Plan** (`/a/plan`)
- Header "Plan" + "+ Deadline" (primary). Student chips (`Segmented`-style, scrollable), Week/Month toggle.
- Week: "‹ 16 – 22 Nov ›", legend Shift / Sleep / Free. One row per day: weekday + date, `DayBar` (00–24 in the student's zone; now-marker on today), then `DeadlineCard`s.
- Times are the student's. When the Admin's zone differs: a line under the week header "Times in {city} time", and every card time and "Move to …" label adds the Admin's time with `TimeBoth` `compact` ("21:00 · 19:30 yours"; spec FR-008, constitution IV).
- `DeadlineCard`: drag handle ⋮⋮, title, right side "Done" (green) / "2 days late" (red) / "21:00" (amber or grey). With a clash: amber border, "{name} is on shift then" + button "Move to {Sat 18:00}".
- Long-press drag between days (`@dnd-kit`, research R10); keyboard: focus a card, Space to lift, ↑/↓ to change day, Space to drop, Esc to cancel; tap opens `DeadlineSheet`.
- Hint under the week: "Long-press a deadline and drag it to another day to reschedule. {name} gets a notification." (FR-014: name, not pronoun.)
- Month: `CalendarMonth` with a count badge per day (red when any late); tap a day → week view of that week.
- `DeadlineSheet`: course picker → "Whole course" or lesson picker (Published lessons only) → `DueField` (+ warnings, incl. "Later than the course deadline") → Save / Remove deadline.
- Empty states: no linked students; a week without deadlines shows bars only.

## Student screens

**Today** (`/s/today`)
- Header from 004/005 is out of scope; 003 renders the date line ("Fri, 20 Nov · Tokyo", existing `TodayLabel`) and greeting.
- "Overdue · N" (red heading): rows with red dot, lesson title, "{course} · {n} min", red chip "N days late" / "Overdue".
- "Due today": amber dot, chip "by 21:00".
- Today chips come from `DueChip` `variant="today"`: "N days late" / "Overdue" (red) and "by {time}" (amber). The course screen uses the default variant (table below).
- Each section shows 5 rows, then "Show all (N)". Rows link to `/s/lessons/[id]`.
- Empty: "Nothing due today" (no sections shown).

**Courses list** — under each active card's title: "due 31 Dec" or "no deadline", plus "· 1 overdue" in red when > 0.

**Course screen** — header line "Assigned by {admin} · finish by {date}" (no "finish by" without a course deadline). Lesson row chip and detail line:

| Status | Chip | Detail line | Number circle |
| --- | --- | --- | --- |
| done | "Done" (green) | "{n} min" | check, green |
| overdue | "N days late" / "Overdue" (red) | "{n} min · was due {Wed 18 Nov}" | red |
| due soon, today | "Due today" (amber) | "{n} min · {21:00} tonight" | amber |
| due soon, tomorrow | "Due tomorrow" (amber) | "{n} min · {09:00}" | amber |
| upcoming | "Due {24 Nov}" (grey) | "{n} min" | grey |
| locked | "Locked" (grey) | "{n} min · unlocks after {15}" (002) | grey |
| none | 002's Open/Locked | 002 | grey |

## Shared components (new)

| Component | Path | Used by |
| --- | --- | --- |
| `DayBar` | `src/components/shared/day-bar.tsx` | Plan (003), Shifts/Plan (005) |
| `CalendarMonth` | `src/components/shared/calendar-month.tsx` | Plan month (003), Shifts (005), Progress (004) |
| `TimeBoth` | `src/components/shared/time-both.tsx` | `DueField` (003), message composer (006) |
| `StatusChip` tones `danger`, `warning` | `src/components/shared/status-chip.tsx` | course rows, Today, Plan |

Feature components in `src/features/assignments/components/`: `AssignSheet`, `AssignStudentRow`, `DueField`, `ClashNotice`, `PlanView`, `PlanWeek`, `PlanMonth`, `DeadlineCard`, `DeadlineSheet`, `TodayView`, `DueChip`.

## Message namespaces (new)

`assign`, `deadlines` (chips, detail lines, warnings), `plan`, `today`, `reminders.default` (rule messages), `notices` (notification titles and bodies), plus new `errors.*` codes (contracts/server-actions.md). All in `en`, `my`, `ja`.
