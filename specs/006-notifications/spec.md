# Feature Specification: Notifications — Rules and Scheduled Messages

**Feature Branch**: `006-notifications`
**Created**: 2026-11-20
**Status**: Implemented
**Input**: User description: "006-notifications" (the draft spec written at project setup, refined)
**Screens**: Admin `24-AdminNotify.png` (Alerts), `26-AdminRule.png` (rule editor), `25-AdminMessage.png` (composer); Student `04-Today.png` (bell), `11-Profile.png` (Quiet hours, My reminders)

## Clarifications

### Session 2026-11-23
- Q: May a student mute reminders that their Admin set up, and for how long? → A: No. Students see the Admin's rules that apply to them but can't mute or change them; they control their quiet hours and their own reminders (US5, FR-016).
- Q: When a rule reminder waits because the student is on shift or asleep, is it still sent however late? → A: No; each reminder lapses when it no longer applies: Daily and Streak at risk at the end of that local day, Due soon at the deadline, Overdue at its next repeat, Inactive when the student studies again. One-off messages, notices and the weekly summary are always delivered (FR-017, US4).
- Q: What does "Copy me" on a rule send the Admin? → A: A copy of each delivery in the Admin's inbox only, with no phone notification, so a rule for all students doesn't buzz the Admin's phone once per student (FR-018).
- Q: What does the weekly summary contain? → A: For the student: lessons done, study time and streak for the week, overdue lessons and the next 3 deadlines. For the Admin: the same, one line per student (FR-019).
- Q: Does a rule for "All students" also cover students linked later? → A: Yes; it applies to every student linked to the Admin at the time of each occurrence (FR-020).
- Q: Does signing out stop notifications to that device? → A: Yes; signing out removes the device, so a shared or handed-over phone stops getting the previous user's notifications (FR-014).
- Constitution alignment (no question needed): notifications for the Admin wait for the Admin's own waking and quiet hours, as for every recipient (FR-003, FR-013).

## User Scenarios & Testing

### User Story 1 – Receive notifications on every device (Priority: P1)
A student or Admin turns on reminders on each phone or computer they use. Everything meant for them lands in an in-app inbox (the bell) and, where reminders are on, as a phone notification. This includes the notices that 003 and 004 already record: "Notify students now", deadline set/changed/removed, a submission for the Admin, and Reviewed / Needs redo for the student. It also includes 005's Sunday shift check.

**Why this priority**: Every other story depends on a way to deliver; 003–005 already record notices that nobody can see yet.

**Independent Test**: As May, turn on reminders, then have Zin review May's submission: a notification arrives on May's device and the bell shows it unread; tapping it opens the lesson and marks it read.

**Acceptance Scenarios**
1. **Given** a first visit after sign-in, **When** the user taps "Turn on reminders", **Then** the device's permission prompt appears and, if allowed, that device receives notifications from then on.
2. **Given** an iPhone where the app isn't installed to the Home Screen, **Then** a short "Add to Home Screen" guide is shown instead of the permission prompt (phone notifications need the installed app on iPhone).
3. **Given** notifications are denied or not supported, **Then** everything still appears in the inbox, and Me shows that reminders are off on this device.
4. **Given** the bell on Today (student) or the top bar (Admin), **Then** it shows the unread count; the inbox lists items newest first, and tapping one opens its link (lesson, deadline, shifts) and marks it read.
5. **Given** a notice recorded by 003 or 004 (e.g. "Needs redo" on a lesson), **Then** it is delivered once to the recipient within the delivery window, following US4.
6. **Given** a student with at least one shift, **When** it is Sunday 18:00 in the student's time and the week isn't confirmed yet, **Then** the student is notified "Next week's shifts — correct?", which opens Shifts (005 FR-009).

---

### User Story 2 – Admin sets automatic reminders (Priority: P1)
On the Alerts tab ("Reminders"), the Admin picks a student (or All students), sees the scheduled messages and the automatic rules, turns rules on and off, and edits or adds them.

**Why this priority**: Rules are how an Admin keeps a busy shift worker on track without writing messages every day.

**Independent Test**: Create "Daily study reminder 20:00 Mon–Fri" for May; it is delivered at 20:00 May's time on weekdays, not on weekends, and not while May is on shift: then at May's next free moment that day, or not at all once the day is over (FR-017).

**Acceptance Scenarios**
1. **Given** the Alerts tab, **When** the Admin taps "+ Rule", chooses a trigger, timing, message, who it applies to and where to send it (phone, in-app, a copy to the Admin), **Then** the rule is saved for that student or for all the Admin's students.
2. The triggers MUST be:
   - Daily time (days of week);
   - After a shift ends (+N h);
   - Due soon (N h before; one or more);
   - Overdue (at the deadline, then repeat daily at a time; at most N reminders in all, the one at the deadline included);
   - Streak at risk (at a time, if nothing was done that day);
   - Inactive for N days (to the student and/or the Admin; the Admin gets one alert per inactive student);
   - Weekly summary (day and time; to the student and/or the Admin; the Admin gets one summary per rule and week, one line per student).
3. **Given** a student assigned a course with "Add default reminders" on (003 FR-013), **Then** they have the default set (FR-008), shown as rules the Admin can change or turn off.
4. **Given** a rule turned off, **Then** nothing is generated from it until it is turned on again; nothing missed while it was off is sent later.
5. **Given** a rule, **When** the Admin taps "Send test to my phone", **Then** a preview with sample values arrives on the Admin's own devices only. If the Admin is in their own quiet hours or outside waking hours at that moment, nothing is sent and the editor says why (constitution: never during a quiet block).
6. **Given** a student picked, **Then** a note says times are in that student's time zone and that nothing is sent while they're on shift, asleep or in quiet hours, naming the student ("Times are in May's time zone (Tokyo)…").

---

### User Story 3 – Admin sends or schedules a one-off message (Priority: P1)
The Admin writes a message to one or more students, optionally from a template and with a lesson linked, and sends it now or at a chosen time.

**Why this priority**: A personal nudge at the right moment is the Admin's main way to support a student directly.

**Independent Test**: Schedule "Particle で is only 15 min…" to May for 18:00 May's time with a lesson linked; it appears under Scheduled messages with Edit and Cancel send, arrives at 18:00 Tokyo time (15:30 in Zin's Yangon), opens the lesson, and then shows as read once May opens it.

**Acceptance Scenarios**
1. **Given** the composer, **When** the Admin picks students, writes text (or picks a template: Today's lesson, Great job!, Catch up, Good luck at work) and optionally links a lesson, **Then** they choose when: Now, a quick time (15:00, 18:00, 22:00), Next free time, or a picked date and time.
2. **Given** a time, **Then** it is shown in both clocks ("18:00 May's time (Tokyo) · 15:30 your time (Yangon)"); a switch ("May's time · Tokyo" / "My time · Yangon") sets which clock the quick times use. The screenshots' "her time" becomes the student's name (FR-012).
3. **Given** a quick time already past today, **Then** it rolls to tomorrow and says so ("15:00 tomorrow").
4. **Given** a time inside a student's shift, sleep or quiet hours, **Then** a warning names the student and offers one tap to the nearest free time ("May is on shift then. Send at 21:00 instead"); otherwise it confirms "May is free then".
5. **Given** "Next free time", **Then** each student gets it at their own next free moment.
6. **Given** a scheduled message, **Then** Alerts lists it under "Scheduled messages" with Edit and Cancel send until it is sent; after sending, it shows who has read it.
7. **Given** "Send a nudge" on a student's card, **Then** the composer opens with that student picked.
8. **Given** "Need it every day? Make it a rule instead", **Then** the rule editor opens with a Daily time rule filled from the message.

---

### User Story 4 – Nothing arrives while working, asleep or in quiet hours (Priority: P1)
Reminders and messages wait for the student's next free moment, using the shifts, sleep blocks and waking hours from 005 and the quiet hours from US5.

**Why this priority**: A notification during a night shift or after one, while sleeping, is the problem StudyMate exists to avoid (constitution).

**Independent Test**: With May on a night shift 22:00–07:00 and 8 h sleep, a Daily 20:00 reminder arrives at 20:00. A message scheduled for 23:00 arrives at 15:30 the next day, May's next free moment. A message marked urgent arrives at 23:00.

**Acceptance Scenarios**
1. **Given** an item due while the student is on shift, asleep, outside waking hours or in quiet hours, **Then** it is delivered at their next free moment instead.
2. **Given** a message the Admin marks urgent, **Then** it is delivered at its time even inside those blocks.
3. **Given** several items due for the same person within 10 minutes (including items released together after a block), **Then** they arrive as one notification ("3 reminders: …"), and each still appears in the inbox.
4. **Given** a postponed rule reminder that no longer applies by the time the student is free (FR-017), **Then** it lapses: it isn't sent and doesn't appear in the inbox. Example: "Streak at risk 21:30" held by a night shift lapses at midnight.
5. **Given** a student with no shift information, **Then** reminders use the fixed times, still respecting waking and quiet hours (005 US4 scenario 3).

---

### User Story 5 – Student controls their own reminders (Priority: P2)
Under Me, the student sets quiet hours and manages "My reminders": their own personal reminders, with the Admin's rules that apply to them listed for information.

**Why this priority**: Students know their own day best; without control they turn notifications off entirely.

**Independent Test**: As May, set quiet hours 12:00–13:00 and add a personal reminder "Kanji 10 min" at 12:30 daily: it arrives at 13:00.

**Acceptance Scenarios**
1. **Given** Me → Quiet hours, **Then** the student sets a daily window (it may cross midnight) or none; shift and sleep blocks always count as quiet; the row reads e.g. "While on shift + sleep" or "22:00–07:00 + shift and sleep".
2. **Given** Me → My reminders, **Then** the student sees the Admin's rules that apply to them and their own reminders; the row shows how many are on ("3 on").
3. **Given** "+ Reminder", **Then** the student adds a personal reminder: a message, a time and days of the week; it follows US4 like any other reminder.
4. **Given** an Admin rule in My reminders, **Then** it is shown read-only ("Set by Zin"): the student can't mute, change or delete it. Quiet hours (scenario 1) still hold it back like any other reminder.

---

### Edge Cases
- Several items due at the same moment → one notification ("3 things due today"); each item is still in the inbox.
- A rule reminder and a message due within 10 minutes of each other → one notification mentioning both.
- A device is offline → the phone's notification service holds it; the inbox shows it on the next open.
- A device's notification registration has expired or been revoked → it is removed and that device gets nothing until reminders are turned on again; the inbox is unaffected.
- A user signs out on a device → that device stops getting their notifications; whoever signs in next turns reminders on for themselves.
- The Admin and the student are in different time zones → rules are always evaluated in the student's time zone; the Admin sees both clocks.
- A student changes time zone → future rule times follow the new zone ("20:00" stays 20:00 local); scheduled messages keep their exact moment.
- A deadline moves or is removed → due-soon and overdue reminders follow the new deadline; none are sent for a removed deadline.
- A student finishes a lesson before its due-soon reminder → that reminder isn't sent.
- A student is unlinked from the Admin → the Admin's rules and unsent messages to them stop; the student's own reminders stay.
- A scheduled message whose students were all unlinked or deleted → it is cancelled and shows so on Alerts.
- Daylight-saving change → "20:00 daily" stays 20:00 local; a time that doesn't exist that day (spring forward) moves to the next valid minute.
- Variables with no value (e.g. `{lesson}` on a Daily reminder without a lesson) → left out with the surrounding quotes, never shown as `{lesson}`.

## Requirements

### Functional Requirements
- **FR-001**: Channels: phone/browser notifications (per device the user turned on), the in-app inbox (always), and email for the weekly summary only.
- **FR-002**: Due rules and messages MUST be found and delivered at least every 5 minutes.
- **FR-003**: Before delivering to a student, availability (005) MUST be checked; while the student is on shift, asleep, outside waking hours or in quiet hours, delivery waits until their next free moment, except for messages marked urgent. Items for the Admin wait for the Admin's own waking and quiet hours, not the student's (constitution: every recipient).
- **FR-004**: Each occurrence (rule or message, recipient, occurrence time) MUST be delivered at most once, also when delivery is retried.
- **FR-005**: Message text supports `{name}`, `{lesson}`, `{course}`, `{due}`, filled in the recipient's language and time zone; a linked lesson opens on tap.
- **FR-006**: Scheduled messages can be edited or cancelled until they are sent.
- **FR-007**: An item is read when the recipient opens the notification or the inbox item; the Admin sees read status for their messages.
- **FR-008**: The default rule set (created by 003's "Add default reminders"): Daily 20:00 Mon–Fri, Due soon 24 h and 2 h before, Overdue at the deadline then daily 19:00, at most 3 in all, Streak at risk 21:30.
- **FR-009**: Notices recorded by 003 and 004 MUST be delivered through the same channels and rules (US4), keeping their rule that a newer notice for the same item replaces an older unsent one.
- **FR-010**: 005's Sunday check MUST also be sent as a notification at Sunday 18:00 student time when due (005 FR-009); Confirm or Edit in the app removes it from the inbox's unread count.
- **FR-011**: Due-soon, overdue and streak reminders MUST use the effective deadline (003 FR-004) and completion (004) at the moment of delivery, so finished, moved or removed work produces no reminder.
- **FR-012**: Text about a student MUST use their name, never a pronoun (003 FR-014), in every language.
- **FR-013**: Quiet hours: one daily window per user, student or Admin (may cross midnight), or none, set under Me. For a student, shift and sleep blocks are always quiet too.
- **FR-014**: Each user can turn notifications on and off per device and see the current state in Me; signing out on a device turns them off there. The inbox keeps everything regardless.
- **FR-015**: All notification text and the inbox MUST be available in English, Burmese and Japanese, in the recipient's language.
- **FR-016**: Only the Admin can turn off, change or delete their rules; a student can't mute them. Students change only their quiet hours and their own reminders.
- **FR-017**: A postponed rule reminder lapses when it no longer applies: Daily time and Streak at risk at the end of that local day; Due soon at the deadline; Overdue at its next repeat; After shift ends at the start of the next shift; Inactive when the student studies again. A lapsed reminder isn't sent and isn't in the inbox. One-off messages, notices (FR-009, FR-010) and the weekly summary never lapse.
- **FR-018**: "Copy me" puts a copy of each delivery in the Admin's inbox only (no phone notification); copies made within 10 minutes are bundled like any other items.
- **FR-019**: The weekly summary tells the student their lessons done, study time and streak for the week, their overdue lessons and their next 3 deadlines; the Admin's version has one such line per student. It is sent in-app and by email.
- **FR-020**: A rule for "All students" applies to every student linked to the Admin at each occurrence, including students linked after the rule was made.

### Permissions
| Action | Student | Admin |
| --- | --- | --- |
| Turn notifications on/off for own devices; read own inbox | ✓ | ✓ |
| Create, edit, turn off rules | own personal reminders | ✓ for own linked students |
| Send or schedule messages; see read status | – | ✓ to own linked students |
| Set quiet hours | ✓ own | ✓ own |
| Turn off or change an Admin rule | – (sees it read-only) | ✓ own rules |

### Key Entities
- **Reminder rule**: who it belongs to (the Admin, or the student for a personal reminder), the student it applies to (or all the Admin's students), trigger and timing, message, channels, on/off.
- **Scheduled message**: the Admin, its students, text, linked lesson, when (now, a time, next free), urgent or not, status (scheduled, sent, cancelled), per-student delivery and read time.
- **Device registration**: a user's device that may receive notifications.
- **Notification (inbox and log)**: recipient, where it came from (rule, message or notice), occurrence, title, text, link, delivered and read times.
- **Quiet hours**: on each user's profile, student or Admin (005 already stores waking hours and sleep).

## Success Criteria

### Measurable Outcomes
- **SC-001**: 99% of notifications arrive within 5 minutes of their due time, or of the end of the block they waited for.
- **SC-002**: No notification for a student is ever delivered inside their shift, sleep, outside-waking or quiet blocks, unless marked urgent (also 005 SC-003).
- **SC-003**: No recipient ever gets the same occurrence twice.
- **SC-004**: An Admin schedules a message to one student with a template and a quick time in under 20 seconds.
- **SC-005**: Every notification is in the recipient's inbox, including on devices where notifications are off.

## Assumptions
- Delivery uses the project's existing web push and email services; due items are checked every 5 minutes, so a notification can be up to 5 minutes late.
- Phone notifications on iPhone need iOS 16.4 or later with the app added to the Home Screen; other browsers need permission per device.
- Showing a notification and opening its link from the phone is set up here; what a tapped notification does offline is 008's.
- The inbox keeps items for 90 days.
- A personal reminder is a daily-time reminder (time and days); other triggers are the Admin's.
- Email goes only to the account's sign-in address and only for the weekly summary.
- Urgent is available on one-off messages only, not on rules.
- Reading status covers the inbox and opened notifications; a notification seen but not tapped isn't "read".
- Builds on 001 (links), 003 (deadlines, notices, default rules), 004 (completion, streak, notices) and 005 (shifts, sleep, waking hours, next free time).
- Out of scope: chat or replies, notifications for other admins, SMS, appearance (007), offline queues (008).
