# Contract: UI routes — 006

Rules for every screen: phone first (390×844), tap targets ≥ 44 px, theme tokens only, all text from the message files, a student named instead of "she/he" (FR-012).

| Route | What | Screenshot |
| --- | --- | --- |
| `/s/today` | + bell (unread count) in the header; + "Turn on reminders" card until on or dismissed | `04-Today.png` |
| `/s/inbox` · `/a/inbox` | the inbox (new, full screen) | – |
| `/s/me` | + "Reminders on this device", "Quiet hours" and "My reminders" rows (Study section) | `11-Profile.png` |
| `/s/me/reminders` | personal reminders and the Admin's rules (new) | – |
| `/a/students` | the bell turns on; + "Turn on reminders" card; + "Send a nudge" on each student card → composer with that student (US3 scenario 7) | `16-AdminStudents.png` |
| `/a/alerts` | replaces the placeholder: chips, note, scheduled messages, automatic rules | `24-AdminNotify.png` |
| `/a/alerts/rules/new` · `/a/alerts/rules/[ruleId]` | the rule editor (full screen) | `26-AdminRule.png` |
| `/a/alerts/messages/new` · `/a/alerts/messages/[messageId]` | the composer (full screen) | `25-AdminMessage.png` |
| `/a/me` | + "Reminders on this device" and "Quiet hours" rows | – |

## Screens

**Bell**: a 44 px round button with a dot and the unread count (aria-label "Notifications, 3 unread"). It opens the inbox.

**Inbox** (`/s/inbox`, `/a/inbox`):
- Back, "Notifications", "Mark all read".
- Rows: an unread dot, title, text (2 lines), time ("18:02", "Yesterday 18:02", "Fri 20 Nov"). Tapping marks the row read and opens its link.
- Empty state: "Nothing here yet".
- More rows load on scroll.

**Turn on reminders** (card and Me row), by device state:
- `off`: "Get reminders on this phone" with **Turn on**.
- `needs-install` (iPhone not added to the Home Screen): a sheet "Add StudyMate to your Home Screen" with 3 steps (Share → Add to Home Screen → open it from there).
- `denied`: "Reminders are blocked in your browser settings. They still appear in Notifications."
- `unsupported`: "This browser can't show reminders. They still appear in Notifications."
- `on`: the Me row reads "On"; tapping offers Turn off.

**Alerts** (`/a/alerts`, 24-AdminNotify.png):
- Header "Reminders", **+ Rule** and **Message**.
- Chips for each student and "All students" (`?student=`).
- Note: "Times are in May's time zone (Tokyo). Nothing is sent while May is on shift, asleep or in quiet hours; it waits until after." With All students: "Times are in each student's time zone…".
- "Scheduled messages · n": a card each with "Today 18:00 May's time", "15:30 yours · to May", the text (2 lines), **Edit**, **Cancel send** (confirm), and "Sent: n this week" on the last card's row.
- "This week": the week's sent and cancelled messages, newest first. A sent card shows each student's state (Scheduled, Delivered, Read); a cancelled card says "Cancelled", also when it was cancelled because no student was left.
- "Automatic rules": a row each with a type badge (DAY, SHIFT, DUE, LATE, FIRE, IDLE, WEEK), title, summary ("20:00 · Mon–Fri", "2 h after each shift", "24 h and 2 h before", "At deadline, then daily 19:00 · max 3", "21:30 if nothing done today", "Nudge May · alert me", "Sunday 18:00 · to both") and a switch. Tapping the row opens the editor.
- Empty: "No reminders yet. Add a rule or send a message."

**Rule editor** (26-AdminRule.png):
- Top bar: Cancel, "New rule" / "Edit rule", Save.
- "When should it fire?": trigger chips (Daily time, After shift, Due soon, Overdue, Streak at risk, Inactive days, Weekly summary).
- Timing fields for the trigger:
  - Daily: time and weekday toggles;
  - After shift: hours;
  - Due soon: up to 3 "hours before";
  - Overdue: first reminder "At the deadline", "Then repeat daily at …", "Stop after n reminders";
  - Streak: time;
  - Inactive: days, and who gets it;
  - Weekly: day, time, and who gets it.
- "Applies to": the student, or All students.
- "Message" with the hint "Use {lesson}, {course}, {due}, {name}".
- "Send to": Push and Copy me.
- "Preview": a phone-style card with the rendered text.
- Bottom: **Send test to my phone**. Editing an existing rule also offers **Delete rule** (confirm).

**Composer** (25-AdminMessage.png):
- Top bar: Cancel, "New message" / "Edit message".
- "To": a chip per student with their city; preselected from "Send a nudge" or the Alerts chip.
- "Message": template chips (Today's lesson, Great job!, Catch up, Good luck at work) and the text.
- "Opens:" a lesson picker (optional), with × to clear.
- "When to send": a clock switch ("May's time · Tokyo" / "My time · Yangon"; with several students in different zones, only "My time" and each student's own time per card).
- Six tiles: Now (immediately), 15:00, 18:00, 22:00 (each "today" or "tomorrow"), Next free (shift-aware), Pick… (date and time).
- A summary card:
  - "Today, 18:00 · 18:00 May's time (Tokyo) · 15:30 your time (Yangon)";
  - then "✓ May is free then, a good study time", or a warning: "May is on shift then (22:00–07:00)" with **Send at 07:30 instead**;
  - an **Urgent** switch with the hint "Delivers even during shifts and sleep".
- Link: "Need it every day? Make it a rule instead".
- Bottom button: "Schedule · Today, 18:00" or "Send now".

**Me** (11-Profile.png, Study section for students):
- Rows: "Shift calendar" (005), "Weekly goal" (004), "Quiet hours" ("While on shift + sleep"), "My reminders" ("3 on"), and "Reminders on this device" (On / Off).
- Quiet hours sheet: None, or From and To.
- **My reminders** (`/s/me/reminders`):
  - "Your reminders": each personal reminder with a switch, and **+ Reminder** (message, time, days);
  - "From Zin": the Admin's rules, read-only, each with its summary and "Set by Zin" (FR-016).

## Intentional differences from the screenshots

- "In-app" isn't a choice on the rule editor: the inbox always gets every item (FR-001). Only Push and Copy me are shown.
- "Applies to" on the rule editor chooses the student or All students. The screenshot's "All of May's work" is the only scope for work rules, so it isn't a separate menu.
- "her time" / "she" in 24- and 25- screenshots becomes the student's name (FR-012).
- The composer's urgent switch isn't in the screenshot; FR-003 needs it.
- The screenshot's Weekly summary isn't among the editor's trigger chips; 006 adds it as the seventh chip (US2 scenario 2).
