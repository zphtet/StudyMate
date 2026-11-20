# Feature Specification: Notifications — Rules and Scheduled Messages

**Feature Branch**: `006-notifications`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: `24-AdminNotify.png`, `26-AdminRule.png`, `25-AdminMessage.png`, Student `04-Today.png` (bell), `11-Profile.png` (My reminders, quiet hours)

## User Scenarios & Testing

### User Story 1 – Enable push on every device (Priority: P1)
**Acceptance Scenarios**
1. **Given** a first visit after sign-in, **When** the user taps "Turn on reminders", **Then** the browser permission prompt appears and the push subscription is saved for that device.
2. **Given** iPhone Safari not installed to Home Screen, **Then** a guided "Add to Home Screen" sheet is shown before asking (push needs iOS 16.4+ installed PWA).
3. **Given** push is denied, **Then** notifications still appear in the in-app inbox.

### User Story 2 – Admin creates automatic rules (Priority: P1)
**Independent Test**: Create "Daily 20:00 Mon–Fri" for a student; it is delivered at 20:00 student time on weekdays.

**Acceptance Scenarios**
1. **Given** the Alerts tab, **When** the Admin taps "+ Rule", chooses a trigger, timing, message and channels, **Then** the rule is saved per student (or for all students).
2. Triggers MUST include: Daily time (days of week), After shift ends (+N h), Due soon (N h before, multiple), Overdue (at deadline, then repeat daily at time, max N), Streak at risk (time if nothing done today), Inactive N days (to student and/or admin), Weekly summary (day + time).
3. **Given** a rule, **When** the Admin taps "Send test to my phone", **Then** a preview push arrives on the Admin's device.
4. **Given** a rule toggle switched off, **Then** no notifications are generated from it.

### User Story 3 – Admin sends or schedules a one-off message (Priority: P1)
**Acceptance Scenarios**
1. **Given** the composer, **When** the Admin picks students, writes text (or a template) and optionally links a lesson, **Then** they choose: Now, quick times (15:00, 18:00, 22:00), Next free time, or a custom date/time.
2. **Given** a time, **Then** it is shown as "{her time} (Tokyo) · {your time} (Yangon)"; a toggle sets which clock the quick times use.
3. **Given** a quick time already past today, **Then** it rolls to tomorrow and says so.
4. **Given** a time inside the student's shift or sleep, **Then** a warning appears with a one-tap fix to the nearest free time (e.g. "Send at 21:00 instead").
5. **Given** a scheduled message, **Then** it appears on Alerts under "Scheduled messages" with Edit and Cancel until sent; after sending, read status is shown.
6. **Given** "Send a nudge" on a student card, **Then** the composer opens with that student preselected.

### User Story 4 – Student controls their own reminders (Priority: P2)
**Acceptance Scenarios**
1. **Given** Me → My reminders, **Then** the student can add personal reminders and mute admin rules for up to 7 days [NEEDS CLARIFICATION: may students mute admin rules?].
2. **Given** quiet hours, **Then** nothing is delivered in that window; items wait until it ends.

### Edge Cases
- Several items due at the same moment → bundle into one push ("3 things due today").
- A rule and a message both due within 10 minutes → send one, mention both.
- Student offline → push is queued by the push service; inbox shows it on next open.
- Expired push subscription (410) → delete it; keep inbox delivery.
- Admin and student in different timezones → rules are always evaluated in the student's timezone.

## Requirements

### Functional Requirements
- **FR-001**: Delivery channels: Web Push (VAPID), in-app inbox (always), email via Resend (weekly summary only).
- **FR-002**: A scheduler MUST run every 5 minutes (pg_cron → the app's `/api/cron/dispatch` endpoint), find rules and messages due in the window, and send them.
- **FR-003**: Before sending, the scheduler MUST check the student's availability (feature 005); if the student is on shift, asleep, in quiet hours or outside waking hours, delivery is postponed to the next free moment, except messages marked "urgent".
- **FR-004**: Every send MUST be written to a log keyed by (rule or message, student, occurrence) to prevent duplicates.
- **FR-005**: Message text supports variables `{name}`, `{lesson}`, `{course}`, `{due}`; a linked lesson opens on tap.
- **FR-006**: Scheduled messages are editable/cancellable until `sent_at` is set.
- **FR-007**: Read receipts: `read_at` set when the student opens the notification or inbox item.
- **FR-008**: Default rule set created on assignment (feature 003): daily 20:00, due soon 24 h + 2 h, overdue daily 19:00 max 3, streak at risk 21:30.

### Key Entities
- **NotificationRule**: admin, student (or all), trigger type, schedule JSON, offset, message, channels, enabled.
- **ScheduledMessage**: admin, students, body, link, send_at, mode (fixed / next_free), status, sent_at.
- **PushSubscription**: user, endpoint, keys, device label.
- **Notification** (inbox + log): user, source, title, body, link, sent_at, read_at.

## Success Criteria
- **SC-001**: 99% of notifications are delivered within 5 minutes of their (possibly postponed) time.
- **SC-002**: Zero deliveries inside shift/sleep/quiet blocks in integration tests.
- **SC-003**: Scheduling a message takes under 20 seconds.
