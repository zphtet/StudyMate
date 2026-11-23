---
description: "Tasks for 006 Notifications — Rules and Scheduled Messages"
---

# Tasks: Notifications — Rules and Scheduled Messages

**Input**: Design documents from `specs/006-notifications/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**:
- plan.md and spec.md (clarified 2026-11-23, six answers).
- 001–005 merged on `main`. The tasks rely on:
  - from 003/004: `recordNotice` and `textsFor` (src/server/notifications/), the default rules in `assignCourse`, the SQL function `effective_due`;
  - from 005: `next_free_at`, `busy_segments` and `weekCheck`;
  - the e2e fixtures `linkStudent`, `seedShift`, `setShiftSettings` and `setTimezone`;
  - the cron routes `/api/cron/purge` and `/api/cron/rotations`.
- Offline behaviour (008) and appearance (007) are out of scope. So are SMS, chat replies, notifications between Admins and students muting Admin rules (research R17).

**Tests**: Required by constitution III (test-first):
- pgTAP for the migration and RLS;
- Vitest unit tests for every pure module, written and failing before the code;
- repo tests against the dev database for the dispatcher (SC-001–SC-003), the repos and the guards;
- Playwright for every user story at 390×844 and 1280×800 with axe, run against a production build on :3100 (leave the dev server on :3000 alone). US4 has no screen of its own, so its spec is one smoke test of holding and urgent through the bell (constitution III).
- Guard denials (`forbidden`) are tested in src/server/auth/guards.test.ts and end to end in Playwright (403). Repo functions don't run guards, so repo tests check scoping (`*_not_found`).

Delivery timing is tested in `dispatch.test.ts`, not in the browser (research R16). While implementing, run one happy-path Playwright test per story with `--grep`; the whole files run in the gates task (T082).

**Organization**: Grouped by user story in the spec's order: US1, US2, US3, US4 (P1), then US5 (P2).
- **US1** builds the delivery pipeline (dispatcher, push, devices), the inbox and the bell. The pipeline holds items for busy recipients from the start, because constitution IV allows no delivery without that check.
- **US2** adds rules, their occurrences, lapsing and the weekly summary.
- **US3** adds one-off messages, urgent and the composer.
- **US4** adds the 10-minute look-ahead, bundling and the cross-source checks for SC-002 and SC-003.
- **US5** adds quiet hours and My reminders.

**Changes to plan.md › Source Code** (CLAUDE.md › Code lives where it's used; plan.md puts these in feature folders that other code would then import):

| Module | plan.md | Here | Why |
| --- | --- | --- | --- |
| `renderMessage`, rule config schemas, `RuleView` type | `features/notifications` | `src/lib/notifications/render.ts`, `rule-config.ts` | used by the dispatcher, both features and the rule editor's preview in the browser |
| `ruleSummary` | `features/alerts` | `src/lib/notifications/rule-summary.ts` | Alerts and My reminders both show it |
| `occurrences`, `bundle` | `features/notifications` | `src/server/notifications/` | only the dispatcher uses them |
| `weekCheck`, 004's activity loaders and streak | `features/shifts`, `features/progress` | `src/lib/week-check.ts`, `src/lib/streak.ts`, `src/server/activity.ts` | the dispatcher needs them (T004, T005), as 005 moved `getBusySegments` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md
- Field rules cite `data-model.md` (`Entity.field`) instead of repeating them.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: database precondition, packages and three shared moves, each its own commit. Branch `006-notifications` already exists.

- [X] T001 Check the dev database precondition for the migration on `DIRECT_URL`. If any count isn't 0, stop and report. (2026-11-23: 0, 0 and 0.)
  - `select count(*) from scheduled_message_recipients where read_at is not null` (data-model.md ScheduledMessageRecipient.read_at is dropped);
  - `select count(*) from notification_rules where char_length(message) not between 1 and 500` (data-model.md NotificationRule.message, new CHECK);
  - `select count(*) from scheduled_messages where char_length(body) not between 1 and 1000` (data-model.md ScheduledMessage.body, new CHECK).
- [X] T002 Add the packages and the shadcn switch:
  - `pnpm add web-push resend`;
  - `pnpm add -D @types/web-push`;
  - `pnpm dlx shadcn@latest add switch`, which creates src/components/ui/switch.tsx;
  - add `RESEND_FROM` (with a comment pointing at Resend's test sender) to .env.example.
- [X] T003 Extract `requireCronSecret(request)` to src/server/cron.ts (research R15): a constant-time compare of `Authorization: Bearer $CRON_SECRET` that throws a 401 `HttpError`.
  - Write src/server/cron.test.ts first: a missing header, a wrong secret, an unset `CRON_SECRET` and the right secret.
  - Use it in src/app/api/cron/purge/route.ts and src/app/api/cron/rotations/route.ts.
  - No behaviour change: `us3-delete-restore` and `us2-rotation` still get 401. Commit on its own.
- [X] T004 [P] Move src/features/shifts/week-check.ts and its test to src/lib/week-check.ts and src/lib/week-check.test.ts (the dispatcher sends the Sunday check, FR-010). Update the imports in src/features/shifts/repo.ts and src/features/shifts/components/week-check-card.tsx. No behaviour change. Commit on its own.
- [X] T005 [P] Move 004's activity code to shared places (the dispatcher needs streak, inactivity and the week's numbers; research R3, R13):
  - src/features/progress/streak.ts and its test → src/lib/streak.ts and src/lib/streak.test.ts;
  - `activityRows`, `dailyActivity`, `dailyActivityForStudents` and `weekFacts` from src/features/progress/repo.ts → src/server/activity.ts;
  - their tests from src/features/progress/repo.test.ts → src/server/activity.test.ts;
  - update the callers in src/features/progress/repo.ts and src/features/progress/admin-repo.ts.

  No behaviour change; 004's tests still pass. Commit on its own.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the migration, the shared rule schemas, rendering, the push sender, `recordNotice`'s delivery state and the fixtures. Every story depends on this phase.

**⚠️ CRITICAL**: no user story work starts until this phase is complete

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [X] T006 [P] Write pgTAP tests in supabase/tests/006_notification_policies.test.sql (data-model.md › Migration). Wrap them in `begin … rollback` and switch users with `set local role authenticated` and `request.jwt.claims`, as 005_shift_policies.test.sql does. Cases:
  - **Rename**: `notification_rules.owner_id` exists, `admin_id` doesn't, and `notification_rules_default_once` uses `owner_id` (data-model.md NotificationRule.owner_id).
  - **Personal rules** (`rules_student_own`): a student inserts, updates and deletes a `daily` rule with `owner_id = student_id = self`. A student can't insert one with another trigger, or one for another student (data-model.md NotificationRule.trigger, NotificationRule.student_id).
  - **Read** (`rules_student_read`): a student reads their active Admin's rules for them and the Admin's "All students" rules. They can't read another Admin's "All students" rules, or their Admin's rules after unlinking. They can't update or delete an Admin's rule (FR-016).
  - **Admin** (`rules_admin`): unchanged for linked students; an Admin can't create a rule for an unlinked student.
  - **CHECKs**: refused: a rule message of 0 or 501 characters, a message body of 1001 characters, and `owner_id = student_id` with a trigger other than `daily` (data-model.md NotificationRule.message, ScheduledMessage.body).
  - **Columns**: a new `notifications` row gets `deliver_at` = now, null `delivered_at` and `expires_at`, `push` true and `urgent` false (data-model.md Notification.deliver_at, Notification.delivered_at, Notification.expires_at, Notification.push, Notification.urgent). `scheduled_message_recipients` has no `read_at` (data-model.md ScheduledMessageRecipient.read_at).
  - **Backfill**: no row has `delivered_at` null while its `sent_at` is before the migration.
  - **Writes**: an `authenticated` client can't insert into `notifications`. The recipients' policies are unchanged.
- [X] T007 [P] Write unit tests in src/lib/notifications/rule-config.test.ts for every schema in contracts/server-actions.md › Field schemas (data-model.md NotificationRule.trigger, NotificationRule.config, NotificationRule.message, NotificationRule.channels, ScheduledMessage.body). Cases:
  - each trigger at its bounds and just past them;
  - duplicate days or offsets → `daysEmpty` / `offsetsInvalid`;
  - `hours` in 0.5 steps;
  - `to` needs 1–2 values;
  - `message` and `body` are trimmed, empty → `messageEmpty`, too long → `messageTooLong`;
  - every config in 003's `DEFAULT_RULES` (src/features/assignments/) parses unchanged.
- [X] T008 [P] Write unit tests for `renderMessage(text, values)` in src/lib/notifications/render.test.ts (research R12; FR-005):
  - each variable is filled;
  - a missing variable is left out together with its quotes: `"{lesson}"`, `“{lesson}”` and `「{lesson}」`, with no double spaces left behind;
  - unknown braces stay as written;
  - `{name}` is the display name as given, never a pronoun (FR-012).

### Implementation

- [X] T009 Edit prisma/schema.prisma:
  - `NotificationRule.adminId` → `ownerId @map("owner_id")`, with the relation renamed to match (data-model.md NotificationRule.owner_id);
  - `Notification.deliverAt`, `deliveredAt`, `expiresAt`, `push`, `urgent` (data-model.md Notification.deliver_at, Notification.delivered_at, Notification.expires_at, Notification.push, Notification.urgent);
  - remove `ScheduledMessageRecipient.readAt` (data-model.md ScheduledMessageRecipient.read_at).

  Generate prisma/migrations/<UTC timestamp>_notifications/migration.sql with `prisma migrate diff` against the committed schema (docs/data-model.md §7).
  - Make sure the rename is `alter table … rename column`, not drop and add.
  - Then add by hand: the policies `rules_student_own` and the replaced `rules_student_read`; the three CHECKs; the backfill `delivered_at = deliver_at = sent_at`; the indexes `notifications_pending` and `notifications_inbox` (data-model.md › Migration).
  - Never drop SQL-only objects (`notifications_user` stays).

  In the same commit, update `adminId` → `ownerId` in src/features/assignments/repo.ts (the default rules) and its test, so typecheck passes.

  (Done 2026-11-23 as `20261123035803_notifications`. Found while doing it, and recorded in data-model.md › Migration:
  - 003's default set didn't match FR-008 (Daily on all 7 days; Overdue's time as `time`). `DEFAULT_RULE_SET` in src/lib/notifications/rule-config.ts is now the one definition, 003's `assignCourse` uses it, and the migration fixes the 28 rows on dev.
  - `inapp` is gone from `channels`.
  - `rules_admin` now checks the Admin role, because any user could create an "All students" rule.
  - `rules_student_read` hides an unlinked Admin's rules.
  - The 0_init 500-character check on message bodies is replaced.
  - 003's pgTAP and `us1-assign` e2e now use `owner_id`.)
- [X] T010 Apply and verify:
  - `pnpm prisma migrate deploy`, `pnpm prisma generate`, `pnpm test:db`;
  - T006 passes, and the 001–005 pgTAP files still pass;
  - quickstart.md §2: `select count(*) from notifications where delivered_at is null` is 0.
- [X] T011 [P] Create src/lib/notifications/rule-config.ts (T007 passes). It holds:
  - `clockTime`, `weekday`, the `ruleConfig` discriminated union, `ruleMessage` and `messageBody` (contracts/server-actions.md › Field schemas; data-model.md NotificationRule.config, NotificationRule.message, ScheduledMessage.body);
  - the `RuleView` type (contracts/route-handlers.md › Shared types), with the trigger from the Prisma enum and the config from `z.infer`.
- [X] T012 [P] Implement `renderMessage` in src/lib/notifications/render.ts (T008 passes). Pure and client-safe: the rule editor's preview uses it too.
- [X] T013 [P] Create `toRuleView(row)` in src/server/notifications/rule-view.ts: channels `push` / `copy` map to `push` / `copyMe`; `config.preset === 'default'` sets `isDefault`; the owner's id and display name are included (data-model.md NotificationRule.channels, NotificationRule.config). Both features' repos use it.
- [X] T014 Give `recordNotice` the delivery state (research R1; data-model.md Notification.deliver_at, Notification.delivered_at) in src/server/notifications/record.ts:
  - First add failing cases to src/server/notifications/record.test.ts: a new notice is pending (`deliver_at` ≈ now, `delivered_at` null); replacing a delivered and read notice makes it pending and unread again (FR-009).
  - Then set `deliverAt: now, deliveredAt: null` on create and update.
- [X] T015 [P] Create the push sender in src/server/notifications/push.ts (research R5, R6; data-model.md PushSubscription):
  - a `PushSender` interface, `send(subscription, payload) → 'ok' | 'gone' | 'failed'`;
  - `webPushSender`, using `web-push` with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, TTL 24 h, payload `{ title, body, url, tag }`; 404 or 410 → `gone`;
  - a recording sender for tests in tests/utils/push-recorder.ts.
- [X] T016 [P] Create the email sender in src/server/notifications/email.ts (research R13):
  - an `EmailSender` interface;
  - `resendSender`, using `RESEND_API_KEY` and `RESEND_FROM`; without a key it skips the send and logs why (no stray `console.log`; use the project's logger if there is one, otherwise `console.warn` with a comment citing R13);
  - `emailAddresses(userIds)`, one raw query on `auth.users`;
  - a recording sender in tests/utils/email-recorder.ts.
- [X] T017 [P] Create e2e fixtures in tests/e2e/fixtures/notifications.ts:
  - `seedNotification({ userId, title, body, url, sourceType?, deliveredAt?, readAt? })`;
  - `seedRule({ ownerId, studentId, config, message, channels?, enabled? })` (data-model.md NotificationRule.owner_id, NotificationRule.student_id, NotificationRule.config, NotificationRule.channels, NotificationRule.enabled);
  - `seedMessage({ adminId, studentIds, body, deliverAt, lessonId?, urgent? })`;
  - `setQuietHours(userId, start, end)` (data-model.md Profile.quiet_start, Profile.quiet_end);
  - `runDispatch(request)`, which POSTs `/api/cron/dispatch` with `CRON_SECRET`;
  - `pushSubscriptionsOf(userId)`.

  Rows cascade with their users. Check that tests/e2e/global-teardown.ts needs no change.

**Checkpoint**: migration applied and tested; schemas, rendering and senders ready. Stories can start.

---

## Phase 3: User Story 1 – Receive notifications on every device (Priority: P1) 🎯 MVP

**Goal**: users turn on reminders per device and see everything in an inbox behind the bell. The dispatcher delivers 003/004's notices and 005's Sunday check, never while the recipient is busy.

**Independent Test**: as May, turn on reminders, then have Zin review May's submission. A notification arrives on May's device and the bell shows it unread; tapping it opens the lesson and marks it read.

### Tests for User Story 1 (write first, see them fail)

- [X] T018 [P] [US1] Write dispatcher tests in src/server/notifications/dispatch.test.ts, against the dev DB with the recording sender (research R2, R6, R9; data-model.md › Lifecycles › A delivery). Cases:
  - **Delivery**: a pending system notice for a free recipient gets one push per device and `delivered_at` set; a second run delivers nothing (FR-004, SC-003).
  - **Held**: a recipient on shift → `deliver_at` moves to `next_free_at`, with no push and no inbox row; the next run after that time delivers it (FR-003).
  - **Replaced notice**: delivered again once.
  - **`push` false** (data-model.md Notification.push): delivered, no push.
  - **Device answers**: `gone` deletes that subscription and still marks the row delivered; `failed` keeps both.
  - **Sunday check** (FR-010; data-model.md Profile.shifts_confirmed_week): a student with shifts, unconfirmed, at Sunday 18:05 local, gets one row with key `week-check@{monday}`, `source_id` = the student and url `/s/shifts`. Not before 18:00, not when the week is confirmed, not without shifts, and not twice. Tokyo and New York. A pending week-check row held by a shift is deleted, not delivered, once the student has confirmed that week.
  - **Retention**: rows older than 90 days are deleted on the first run after 03:00 UTC, and only once that day.
  - **Result**: the counts match contracts/route-handlers.md › Cron.
- [X] T019 [P] [US1] Write tests against the dev DB in src/features/notifications/repo.test.ts (research R8, R9; data-model.md PushSubscription, Notification.read_at). Cases:
  - **Saving a device**: by endpoint; saving the same endpoint as another user moves the row to them.
  - **Deleting a device**: only the caller's.
  - **Inbox**: delivered rows only, newest first, 30 per page with a cursor.
  - **Unread count**: delivered and unread rows only.
  - **Mark read**: works on the caller's delivered row and does nothing the second time. Another user's row, or a pending one → `notification_not_found`.
  - **Mark all read**.
  - **Sign out**: removes the caller's endpoint only.
- [X] T020 [P] [US1] Write unit tests in src/features/notifications/device-state.test.ts for `deviceState({ hasServiceWorker, hasPushManager, permission, isIos, isStandalone, isSubscribed })` → `unsupported` / `needs-install` / `denied` / `off` / `on` (research R8; contracts/ui-routes.md › Turn on reminders). Include iPad desktop-mode Safari.
- [X] T021 [P] [US1] Write unit tests in src/features/notifications/inbox-time.test.ts for `inboxTime(at, now, timeZone)` → `{ kind: 'today' | 'yesterday' | 'date', … }` ("18:02", "Yesterday 18:02", "Fri 20 Nov"), at the local midnight boundary, in Tokyo and Yangon.
- [X] T022 [P] [US1] Write Playwright tests in tests/e2e/us1-inbox.spec.ts (390×844 and 1280×800, axe). Cases:
  - **Independent test**: seed a "Needs redo" notice for May with `recordNotice`'s shape, then `runDispatch`. Today's bell reads "Notifications, 1 unread"; the inbox lists it; tapping it opens the lesson and the count is 0.
  - **Scenario 4**: newest first; Mark all read; `/s/lessons/…?n=<id>` marks the row read and drops the parameter.
  - **Scenario 1**: with permission granted and `PushManager.prototype.subscribe` stubbed by `page.addInitScript` (headless Chromium has no push service), Turn on saves a `push_subscriptions` row, and Me reads "On".
  - **Scenarios 2 and 3**: an iPhone user agent, not standalone, opens the Add to Home Screen sheet; denied permission shows the blocked text, and Me reads "Off".
  - **Sign out** removes the row (FR-014).
  - **Admin**: the bell on Students works, and so does `/a/inbox`.
  - **Access**: `GET /api/notifications` without a session → 401; `POST /api/cron/dispatch` without the secret, and with a wrong one → 401.

  (2026-11-23: only the independent test has run so far, on mobile and desktop. The other cases run with the gates in T082.)

### Implementation for User Story 1

- [X] T023 [US1] Implement `dispatch(now, { push, email })` in src/server/notifications/dispatch.ts (research R2 steps 3–4, R9; T018 passes). Each step is one or a few set-based statements:
  - **Sunday check**: students whose local time is Sunday 18:00–23:59, with `hasShifts` and `confirmedWeek` loaded in one query, judged by `weekCheck` from src/lib/week-check.ts. The text comes from `textsFor`. Insert `on conflict do nothing` with `source_type` `system` and the key `week-check@{monday}` (data-model.md Notification.source_type, Notification.occurrence_key). Before delivery, delete pending week-check rows of students who have since confirmed that week (FR-010).
  - **Availability**: one `next_free_at` statement for every recipient with pending rows due (data-model.md Notification.deliver_at). Rows for a busy recipient move to that time (data-model.md Notification.urgent is honoured from US3 on).
  - **Delivery**: per recipient, one push per due row with `push` true, to every device (data-model.md Notification.push), with the row's title, body and url as stored (data-model.md Notification.title, Notification.body, Notification.url); then set `delivered_at` (data-model.md Notification.delivered_at). Bundling comes in T068.
  - **Retention**: the 90-day purge, once a day.
  - **Result**: the counts.

  Leave clearly named, empty step functions for rule occurrences (T043) and messages (T057), so later tasks fill them in rather than restructure.

  (Done. `dispatch` also takes an optional `scope: { userIds }`, which only tests pass: the dev database is shared, and a run with a fake "now" must not deliver, insert or purge other users' rows. Delivery claims rows (`delivered_at`) before pushing, so a second run never sends twice. The push URL already carries `?n=<id>`.)
- [X] T024 [US1] Create the Route Handler POST src/app/api/cron/dispatch/route.ts (contracts/route-handlers.md › Cron): `requireCronSecret` → `dispatch(new Date(), { push: webPushSender, email: resendSender })` → the counts, through `handle()`. Not in vercel.json: `pg_cron` calls it (quickstart.md §6).
- [X] T025 [US1] Clear the Sunday check when the student answers it (FR-010). Confirm and Edit on `WeekCheckCard` both call `confirmShiftWeek`, so this is one change:
  - First add failing cases to src/features/shifts/rotation-repo.test.ts: after `confirmShiftWeek`, a delivered `week-check@{week}` row of the student is read, and a pending one is gone; another student's row is untouched.
  - Add `settleNotice({ userId, sourceId, occurrenceKey }, db)` to src/server/notifications/record.ts: it marks a delivered row read and deletes a pending one (data-model.md Notification.read_at, Notification.delivered_at, Notification.occurrence_key). It lives next to `recordNotice` because two features use it.
  - Call it from `confirmShiftWeek` in src/features/shifts/rotation-repo.ts, in the same transaction as the profile update.
  - `WeekCheckCard` also invalidates `['notifications']`, so the bell updates at once.
- [X] T026 [US1] Create the repo in src/features/notifications/repo.ts: `savePushSubscription` (upsert by endpoint, so a device another user had moves to the caller; `user_id` and `last_seen_at`; data-model.md PushSubscription.endpoint), `deletePushSubscription`, `listInbox(userId, cursor)`, `unreadCount`, `markRead`, `markAllRead` (data-model.md Notification.read_at, Notification.delivered_at). Every `where` has `userId: me.id`. T019 passes.
- [X] T027 [US1] Write the Server Actions in src/features/notifications/actions.ts with schemas in src/features/notifications/schemas.ts: `savePushSubscription`, `deletePushSubscription`, `markNotificationRead` and `markAllNotificationsRead` (contracts/server-actions.md; `requireUser()` first). Extend `signOut` in src/features/auth/actions.ts to `{ endpoint?: z.url() }`, deleting the caller's subscription before signing out (FR-014). src/features/profile/components/me-view.tsx passes the device's endpoint.
- [X] T028 [US1] Create the Route Handlers GET src/app/api/notifications/route.ts and src/app/api/notifications/unread/route.ts (contracts/route-handlers.md › Everyone). Add `InboxItem` in src/features/notifications/types.ts. In src/features/notifications/queries.ts, add the key factory `['notifications','inbox']` and `['notifications','unread']`, an `infiniteQueryOptions` for the inbox, and the unread query with `refetchOnWindowFocus`.
- [X] T029 [P] [US1] Write public/sw.js (research R7):
  - `push` shows the notification with its `tag`;
  - `notificationclick` focuses an open window or opens `url` with `?n=<id>` (the inbox for a bundle);
  - both post `{ type: 'notifications' }` to open windows.

  Create src/app/manifest.ts: name, short name, start URL by role-neutral `/`, `display: 'standalone'`, theme colours from the tokens' values. Add `sw.js` to the exclusions in src/proxy.ts's matcher (`.webmanifest` is already excluded), so signed-out devices can fetch it.
- [X] T030 [US1] Implement `deviceState` in src/features/notifications/device-state.ts (T020 passes) and `useDeviceReminders()` in src/features/notifications/use-device-reminders.ts (research R8):
  - **turn on**: register `/sw.js`, ask permission, `pushManager.subscribe` with the VAPID public key, then `savePushSubscription`;
  - **turn off**: `unsubscribe`, then `deletePushSubscription`;
  - **dismiss**: the card's dismissed flag goes in `localStorage`, wrapped in try/catch (a per-device convenience);
  - `endpoint()` is for sign-out.
- [X] T031 [US1] Implement `inboxTime` in src/features/notifications/inbox-time.ts (T021 passes). Build the components in src/features/notifications/components/ (contracts/ui-routes.md › Bell, Inbox, Turn on reminders):
  - `Bell`: 44 px, a dot and the count, `aria-label` with the count, links to `/s/inbox` or `/a/inbox`;
  - `Inbox`: back, Mark all read, rows with the unread dot, 2-line text and `inboxTime`; load more on scroll; empty state through `EmptyState`; a tap marks read and opens the link;
  - `TurnOnRemindersCard`;
  - `InstallGuideSheet`, on src/components/shared/bottom-sheet.tsx;
  - `DeviceRemindersRow`, the Me row;
  - `MarkReadOnOpen`: reads `?n=`, marks the row read, replaces the URL, and invalidates `['notifications']` on service-worker messages.

  Use `useMutation` + `useErrorMessage`.

  (Done. The browser-subscription helpers are in src/lib/push-device.ts, because Me's sign-out uses them too: it unsubscribes this browser, so the next user on the device starts with reminders off. The dismissed flag also stays in memory when storage is blocked.)
- [X] T032 [US1] Wire up the screens:
  - src/app/s/inbox/page.tsx and src/app/a/inbox/page.tsx, full screen with the role page guard and a prefetched first page;
  - `Bell` and `TurnOnRemindersCard` in src/features/assignments/components/today-view.tsx (04-Today.png);
  - on src/app/a/(tabs)/students/page.tsx, the disabled bell becomes `Bell`, and `TurnOnRemindersCard` is added;
  - `DeviceRemindersRow` in src/features/profile/components/me-view.tsx for both roles;
  - `MarkReadOnOpen` in src/app/s/layout.tsx and src/app/a/layout.tsx.
- [X] T033 [US1] Add the `inbox`, `bell`, `deviceReminders` and `installGuide` strings, `notices.weekCheck` (title and body, naming no pronoun) and `errors.notification_not_found` to src/i18n/messages/en.json, my.json and ja.json.
- [X] T034 [US1] Run T018–T021 until they pass, and the US1 independent test from T022 with `--grep` on the :3100 build.

**Checkpoint**: US1 works on its own. 003/004's notices and the Sunday check reach phones and the inbox, never while the recipient is busy. This is the MVP.

---

## Phase 4: User Story 2 – Admin sets automatic reminders (Priority: P1)

**Goal**: the Alerts tab lists rules per student or for all students; the Admin adds, edits, turns off, deletes and tests them; the dispatcher turns occurrences into deliveries in the student's zone and lapses held ones that no longer apply.

**Independent Test**: create "Daily study reminder 20:00 Mon–Fri" for May. It is delivered at 20:00 May's time on weekdays, not at weekends, and not while May is on shift. In that case it goes at May's next free moment that day, or not at all once the day is over.

### Tests for User Story 2 (write first, see them fail)

- [X] T035 [P] [US2] Write unit tests in src/server/notifications/occurrences.test.ts for `occurrences(rule, student, data, window)` (research R3 table; data-model.md NotificationRule.trigger, NotificationRule.config, Notification.occurrence_key, Notification.expires_at). Per trigger, check instant, key, lapse time and template values, in a window `(now − 15 min, now]`:
  - **daily**: days of the week; a time that doesn't exist on New York's spring-forward day moves to the next valid minute; on the fall-back day it occurs once; lapses at local midnight.
  - **after_shift**: shift end + hours; lapses at the next shift's start, or never without one.
  - **due_soon**: each offset; none for a completed lesson or one without a deadline; lapses at the deadline.
  - **overdue**: n = 0 at the deadline, then daily at `repeat_time`, `max` reminders in all with the one at the deadline included (data-model.md NotificationRule.config: `max: 1` gives only the one at the deadline; the default `max: 3` gives the deadline and two repeats); each lapses at the next repeat, the last at the end of its day.
  - **streak_risk**: only with no activity that local day.
  - **inactive**: after `days` full local days, once per gap, keyed by the last active date. With `to: admin`, the Admin's occurrence is keyed `{studentId}:inactive@{lastActiveDate}`, so two students with the same last active date give two Admin rows (data-model.md › Occurrence keys).
  - **weekly_summary**: weekday and time, keyed by the week's Monday, never lapses. With `to: admin`, one combined occurrence per rule and week for the Admin, with one line per student.

  Run every case in Tokyo, Asia/Yangon (+06:30) and New York.
- [X] T036 [P] [US2] Write unit tests in src/lib/notifications/rule-summary.test.ts for `ruleSummary(rule, studentName)` → badge (DAY, SHIFT, DUE, LATE, FIRE, IDLE, WEEK), title key and summary key with values, for every example in contracts/ui-routes.md › Alerts. Cover "Mon–Fri", "Every day" and an irregular day list. The student is named, never "she/he" (FR-012).
- [X] T037 [P] [US2] Write tests against the dev DB in src/features/alerts/repo.test.ts (contracts/server-actions.md › Rules; data-model.md NotificationRule.owner_id, NotificationRule.student_id, NotificationRule.channels, NotificationRule.enabled). Cases:
  - **saveRule**: creates for a linked student and for All students (`studentId` null); editing another Admin's rule → `rule_not_found`; editing a default rule keeps `preset: 'default'`.
  - **setRuleEnabled** and **deleteRule**: scoped to the owner.
  - **getAlerts(student | all)**: the chips; for a student, their rules plus the "All students" ones; for all, every rule of the caller.
  - **sendTestPush**: pushes to the caller's own devices only, with sample values and no inbox row; with no device → `push_no_device`; while the Admin is in their own quiet hours or outside waking hours (`next_free_at(admin, now) > now`) → `push_quiet_now` and nothing is pushed (constitution IV).
  - **Guards**: an unlinked student is refused by `requireAdminOf` and a student caller by `requireRole('admin')`. Check that src/server/auth/guards.test.ts covers both and add any missing case there; T039 checks the 403 end to end.
- [X] T038 [P] [US2] Add rule cases to src/server/notifications/dispatch.test.ts (research R2 step 1, R3, R4, R13). Cases:
  - **Independent test**: Daily 20:00 Mon–Fri for May in Tokyo makes a row on a weekday at 20:00 and none at the weekend.
  - **Off and on**: a rule turned off makes nothing; turned on again, nothing missed is sent (US2 scenario 4).
  - **De-duplication**: a run 5 minutes later inside the look-back makes no duplicate (SC-003).
  - **Channels**:
    - `copy` adds an owner row with `push` false and key `{studentId}:{key}` (FR-018);
    - with no `push` channel, the student's row has `push` false.
  - **Who gets it**:
    - an "All students" rule covers a student linked after it was made (FR-020);
    - no row for an unlinked student.
  - **Lapse**: a Daily held by a shift until after local midnight is deleted and never in the inbox (FR-017).
  - **Re-check** (R4, FR-011): a due_soon row is dropped when the lesson is completed, and when the deadline moves or is removed; a streak_risk row is dropped after study; an inactive row is dropped once the student studies.
  - **Weekly summary** (FR-019): the student gets an inbox row with lessons done, study time, streak, overdue lessons and the next 3 deadlines, plus one email to the sign-in address. "To admin" on an "All students" rule gives the Admin one row and one email, with one line per student.
  - **Inactive to the Admin**: an "All students" rule with `to: admin`, and two students with the same last active date, gives the Admin two rows. The Admin's rows follow the rule's `push` channel and wait for the Admin's own hours.
  - **Text**: in the recipient's language, with `{due}` in the student's zone.
- [X] T039 [P] [US2] Write Playwright tests in tests/e2e/us2-rules.spec.ts (390×844 and 1280×800, axe). Cases:
  - **Scenario 3**: May's default rules are listed with badges and summaries.
  - **Scenario 6**: the note names May and Tokyo; with All students, the general note.
  - **Toggle**: turning off Streak at risk survives a reload.
  - **Edit**: Daily changed to 20:00 Mon–Fri.
  - **Scenarios 1 and 2**: + Rule shows each trigger chip's fields; a rule saved for All students appears under every chip.
  - **Send test** with no device shows the `push_no_device` message.
  - **Delete** with confirm.
  - **Access**: signed in as a student, `GET /api/alerts` → 403 and `/a/alerts` doesn't render.

### Implementation for User Story 2

- [X] T040 [P] [US2] Implement `occurrences` in src/server/notifications/occurrences.ts with `@date-fns/tz` and src/lib/time.ts helpers. T035 passes.
- [X] T041 [P] [US2] Implement `ruleSummary` in src/lib/notifications/rule-summary.ts. T036 passes.
- [X] T042 [US2] Write the batched loaders in src/server/notifications/rule-data.ts (research R3 › data in batches, about 5 statements):
  - enabled rules with their target students. A null `student_id` expands to the owner's active links at `now` (data-model.md NotificationRule.student_id). Each student comes with their zone, locale and display name.
  - effective deadlines with completion, through SQL `effective_due`, for those students' assigned lessons;
  - activity from src/server/activity.ts;
  - shifts that ended in the window, with each student's next shift start;
  - for the weekly summary: the week's facts, overdue count and next 3 deadlines.
- [X] T043 [US2] Fill the rule step and the checks in src/server/notifications/dispatch.ts (research R2 step 1, R4, R13). T038 passes.
  - **Rule step**: insert a row per occurrence, `on conflict do nothing`, with `source_type` `rule` and the occurrence's key (data-model.md Notification.source_type, Notification.occurrence_key). Title, body and url are rendered in the recipient's language and zone: `renderMessage` with `textsFor` values (data-model.md Notification.title, Notification.body, Notification.url). `expires_at` comes from the occurrence (data-model.md Notification.expires_at); `push` from the channels; plus the owner's copy row when `copy` is set (data-model.md NotificationRule.channels). Rows for the Admin (`to: admin`) use the keys in data-model.md › Occurrence keys and the rule's `push` channel.
  - **Lapse**: postponed rows whose `expires_at` ≤ the new time are deleted.
  - **Re-check before delivery**: done in one batch with T042's loaders.
  - **Weekly summary**: the email goes through `EmailSender`, as plain HTML from the message files in the recipient's language.
- [X] T044 [US2] Write the alerts repo src/features/alerts/repo.ts (`getAlerts`, `getRule`, `saveRule`, `setRuleEnabled`, `deleteRule`), schemas src/features/alerts/schemas.ts (`saveRule` input built from `ruleConfig`) and Server Actions src/features/alerts/actions.ts (contracts/server-actions.md › Rules):
  - Every action starts with `requireRole('admin')`, plus `requireAdminOf` for a named student.
  - Each `where` has `ownerId: me.id`. `saveRule` writes the trigger from the config (data-model.md NotificationRule.trigger) and `enabled` true on create; `setRuleEnabled` changes only `enabled`, and turning a rule on never back-fills (data-model.md NotificationRule.enabled).
  - `sendTestPush` first checks `next_free_at(me, now)`: if the Admin is busy now, it fails with `push_quiet_now` (constitution IV). Otherwise it renders with sample values and uses `webPushSender` on the caller's subscriptions.

  T037 passes.
- [X] T045 [US2] Create the Route Handlers GET src/app/api/alerts/route.ts (`students` and `rules` for now; `scheduled`, `recent` and `sentThisWeek` arrive in T061) and src/app/api/alerts/rules/[ruleId]/route.ts (contracts/route-handlers.md › Admin). Add `queryOptions` and the key factory `['alerts', student]`, `['alerts','rule',id]` in src/features/alerts/queries.ts.
- [X] T046 [US2] Build the components in src/features/alerts/components/ (contracts/ui-routes.md › Alerts, Rule editor; 24-AdminNotify.png, 26-AdminRule.png):
  - `AlertsView`: header, + Rule, Message, the chips in `?student=`, the note naming the student and zone, the empty state;
  - `RuleRow`: badge, title, summary, and a `Switch` with an optimistic update;
  - `RuleEditor`:
    - react-hook-form with T044's schema; the trigger chips and per-trigger fields;
    - Applies to; Message with the variable hint; Send to: Push and Copy me (no In-app: contracts/ui-routes.md › Intentional differences);
    - Preview through `renderMessage`; Send test; Delete with `alert-dialog`.
- [X] T047 [US2] Create the pages:
  - replace the placeholder in src/app/a/(tabs)/alerts/page.tsx with `AlertsView`, prefetched with `HydrationBoundary`;
  - src/app/a/alerts/rules/new/page.tsx and src/app/a/alerts/rules/[ruleId]/page.tsx, full screen with the Admin page guard.
- [X] T048 [US2] Add these strings to src/i18n/messages/en.json, my.json and ja.json:
  - `alerts`, `ruleEditor`, `ruleSummary`, `weeklySummary` (inbox and email), `pushTexts.test`;
  - `errors.rule_not_found`, `errors.push_no_device`, `errors.push_quiet_now`;
  - `validation.messageEmpty`, `validation.messageTooLong`, `validation.daysEmpty`, `validation.offsetsInvalid`.

  Name students, never use pronouns (FR-012).
- [X] T049 [US2] Run T035–T038 until they pass, and the scenario 1 test from T039 with `--grep` on the :3100 build.

**Checkpoint**: US1 and US2 work: default and custom rules reach students in their own zone and lapse when they no longer apply.

---

## Phase 5: User Story 3 – Admin sends or schedules a one-off message (Priority: P1)

**Goal**: a composer with templates, a linked lesson, both clocks, quick times, Next free, availability warnings and urgent; scheduled messages listed on Alerts with Edit and Cancel send, then read status.

**Independent Test**: schedule "Particle で is only 15 min…" to May for 18:00 May's time with a lesson linked. It appears under Scheduled messages with Edit and Cancel send. It arrives at 18:00 Tokyo time (15:30 in Zin's Yangon) and opens the lesson; once May opens it, it shows as read.

**Sent and cancelled messages**: `GET /api/alerts` also returns `recent` (this week's sent and cancelled messages, newest first), so Alerts shows read status after sending (spec US3 scenario 6) and cancelled messages (Edge Cases). A recipient whose delivery is held stays `scheduled` (data-model.md › Derived values).

### Tests for User Story 3 (write first, see them fail)

- [X] T050 [P] [US3] Write unit tests in src/features/alerts/quick-times.test.ts for `quickTimes(now, timeZone)` (research R11; US3 scenario 3): 15:00, 18:00 and 22:00 as instants in the chosen zone. A time already past rolls to tomorrow with `tomorrow: true`. Check that 18:00 Tokyo is 15:30 Yangon, and the New York daylight-saving day.
- [X] T051 [P] [US3] Write tests against the dev DB in src/features/alerts/messages-repo.test.ts (contracts/server-actions.md › Messages; data-model.md ScheduledMessage.mode, ScheduledMessage.send_at, ScheduledMessage.status, ScheduledMessageRecipient.deliver_at, ScheduledMessageRecipient.delivered_at). Cases:
  - **Scheduling**: `now`, `fixed` and `next_free` set each recipient's `deliver_at` (next free from `next_free_at`, per student); a `fixed` time in the past → `message_time_past`; a lesson the students can't read → `lesson_not_found`. (An unlinked student is refused by `requireAdminOfAll` before the repo runs; check that src/server/auth/guards.test.ts covers it, and T053 checks the 403 end to end.)
  - **Update**: changes only recipients not handed over; once fully handed over → `message_already_sent`.
  - **Cancel**: deletes the pending recipients, and the status becomes `cancelled`, or `sent` if some already went.
  - **Read status**: each recipient's state comes from the `notifications` rows: `scheduled` before hand-over and while the row is held, `delivered` once delivered, `read` once read.
  - **Recent**: `listMessages` returns this week's sent and cancelled messages, newest first, and not older ones.
  - **Availability**: free, shift, sleep (and outside waking hours) and quiet, with `nextFree`, in one statement for 5 students.
  - **Scope**: another Admin's message → `message_not_found`.
- [X] T052 [P] [US3] Add message cases to src/server/notifications/dispatch.test.ts (research R2 step 2, R11). Cases:
  - **Hand-over**: due recipients become rows with `source_type` `message` and key `message`, `urgent` copied, and the text rendered in the recipient's language with `{name}` and `{lesson}`; the url is the lesson. The message becomes `sent` once all recipients are handed over, and a re-run hands over nothing (FR-004).
  - **Urgent**: delivered inside a shift; a non-urgent message is held (data-model.md Notification.urgent).
  - **Unlinked or deleted students**: an unlinked student's pending recipient is deleted, and a message left with no recipient is `cancelled`; a `scheduled` message whose only student's profile was deleted (no recipient rows left) is `cancelled` too (Edge Cases).
  - **Never lapses**: a held message is still delivered after 2 days (FR-017).
- [X] T053 [P] [US3] Write Playwright tests in tests/e2e/us3-messages.spec.ts (390×844 and 1280×800, axe), with `page.clock` set to 16:00 Tokyo. Cases:
  - **Independent test**: template "Today's lesson"; Opens: a lesson; 18:00; the summary reads "18:00 May's time (Tokyo) · 15:30 your time (Yangon)"; Schedule; Alerts lists it with Edit and Cancel send.
  - **Scenario 3**: 15:00 reads "tomorrow".
  - **Scenario 2**: the clock switch flips the tiles.
  - **Scenario 4**: with a seeded shift, the busy warning and its one-tap fix.
  - **Urgent** switch.
  - **Cancel send** with confirm.
  - **Scenario 7**: "Send a nudge" on Students preselects the student.
  - **Scenario 8**: "Make it a rule instead" opens the rule editor with Daily and the text.
  - **Read status**: after delivery and May reading it, the card under "This week" shows Read.
  - **Cancelled**: after Cancel send, the card moves to "This week" marked Cancelled.
  - **Access**: signed in as a student, `GET /api/alerts/availability` and `GET /api/alerts/messages/{id}` → 403.

### Implementation for User Story 3

- [X] T054 [P] [US3] Implement `quickTimes` in src/features/alerts/quick-times.ts. T050 passes.
- [X] T055 [US3] Write src/features/alerts/messages-repo.ts (T051 passes):
  - `scheduleMessage`, `updateMessage`, `cancelMessage`, `getMessage`, `listMessages(adminId, student | all)`;
  - `availability(studentIds, at)`: one `$queryRaw` over `busy_segments` and `next_free_at`;
  - `MessageView` mapping, with read state from the `notifications` rows (data-model.md › Derived values).

  Each `where` has `adminId: me.id`. Field rules:
  - `mode` and `send_at` follow data-model.md ScheduledMessage.mode and ScheduledMessage.send_at (`send_at` null for `next_free`);
  - `urgent` is stored on the message and copied to each delivery (data-model.md ScheduledMessage.urgent);
  - `lesson_id` is optional and must be a lesson every recipient can read (data-model.md ScheduledMessage.lesson_id);
  - one recipient row per student, with its planned `deliver_at` (data-model.md ScheduledMessageRecipient.student_id, ScheduledMessageRecipient.deliver_at).
- [X] T056 [US3] Add the message schemas to src/features/alerts/schemas.ts and the Server Actions `scheduleMessage`, `updateMessage` and `cancelMessage` to src/features/alerts/actions.ts (contracts/server-actions.md › Messages). Each starts with `requireRole('admin')`, then `requireAdminOfAll(studentIds)` so every recipient is a linked student (data-model.md ScheduledMessageRecipient.student_id). The lesson check for data-model.md ScheduledMessage.lesson_id runs in the repo (T055).
- [X] T057 [US3] Fill the message step in src/server/notifications/dispatch.ts (research R2 step 2). T052 passes.
  - Hand over due recipients (data-model.md ScheduledMessageRecipient.delivered_at) as rows with `source_type` `message` and key `message` (data-model.md Notification.source_type, Notification.occurrence_key). Render each one's title, body and url in the recipient's language (data-model.md Notification.title, Notification.body, Notification.url). Set the message to `sent` (data-model.md ScheduledMessage.status).
  - Delete the pending recipients of unlinked students, then set `cancelled` on every `scheduled` message with no recipient rows left (data-model.md ScheduledMessage.status).
  - Make the availability step skip rows with `urgent` (data-model.md Notification.urgent).
- [X] T058 [US3] Create the Route Handlers GET src/app/api/alerts/messages/[messageId]/route.ts and src/app/api/alerts/availability/route.ts (contracts/route-handlers.md › Admin). Parse `students` and `at` with Zod. Add their `queryOptions` in src/features/alerts/queries.ts.
- [X] T059 [US3] Build the components in src/features/alerts/components/ (contracts/ui-routes.md › Composer; 25-AdminMessage.png):
  - `Composer`:
    - To chips with each student's city; template chips; text; the lesson picker with ×;
    - the clock switch (only "My time" when students' zones differ); the six tiles; Pick… for date and time;
    - the summary card with both clocks (src/components/shared/time-both.tsx);
    - the availability line, with its one-tap fix, from the availability query;
    - the Urgent switch with its hint; the "Make it a rule instead" link; the bottom button.
  - `ScheduledMessageCard`: "Today 18:00 May's time", "15:30 yours · to May", 2 lines of text, Edit, Cancel send (confirm). After sending, each recipient's read state.

  Use `useMutation` + `useErrorMessage`.
- [X] T060 [US3] Create the pages and links:
  - src/app/a/alerts/messages/new/page.tsx (`?student=` preselects) and src/app/a/alerts/messages/[messageId]/page.tsx;
  - "Send a nudge" in src/features/progress/components/student-progress-card.tsx, linking to `/a/alerts/messages/new?student={id}`;
  - src/app/a/alerts/rules/new/page.tsx accepts `?message=&student=` to open a Daily rule filled from the message (US3 scenario 8).
- [X] T061 [US3] Extend src/app/api/alerts/route.ts with `scheduled`, `recent` and `sentThisWeek` (contracts/route-handlers.md › GET `/api/alerts`). Show them in `AlertsView`: "Scheduled messages · n" with "Sent: n this week", then "This week" with each sent card's per-student state and cancelled cards marked "Cancelled" (contracts/ui-routes.md › Alerts).
- [X] T062 [US3] Add these strings to src/i18n/messages/en.json, my.json and ja.json:
  - `composer`, `messageTemplates`, `scheduledMessages`;
  - `errors.message_not_found`, `errors.message_already_sent`, `errors.message_time_past`;
  - `validation.recipientsEmpty`.

  Templates are in the Admin's language and name the student (FR-012).
- [X] T063 [US3] Run T050–T052 until they pass, and the independent test from T053 with `--grep` on the :3100 build.

**Checkpoint**: US1–US3 work: notices, rules and one-off messages are delivered through one pipeline.

---

## Phase 6: User Story 4 – Nothing arrives while working, asleep or in quiet hours (Priority: P1)

**Goal**: items due within 10 minutes of each other arrive as one notification, and the whole pipeline is checked against SC-002 and SC-003 for notices, rules and messages, for students and Admins.

**Already built**: holding (T023), lapsing and the re-checks (T043), urgent (T057). This phase adds the 10-minute look-ahead, pulling rows forward, bundling and the end-to-end timing checks.

**Look-ahead (decided 2026-11-23)**: as built through US3, rule rows and message hand-overs are created only once they are due (`≤ now`). Rows due in the next 10 minutes therefore don't exist yet, and research R5's pull-forward has nothing to pull. The fix:
- step 1 (rule occurrences) looks for occurrences in `(now − 15 min, now + 10 min]`;
- step 2 (messages) hands over recipients with `deliver_at ≤ now + 10 min`;
- every row keeps its planned `deliver_at`, so nothing goes out early unless it is bundled with a row that is due now.

Side effect, accepted: a message is handed over, becomes `sent` and stops accepting Edit and Cancel send up to 10 minutes before its time. Spec US3 scenario 6 ("until it is sent") still holds. A rule edited in those 10 minutes keeps the row it already made, because turning a rule off or deleting it already drops its pending rows (src/features/alerts/repo.ts).

**Independent Test**: May has a night shift 22:00–07:00 with 8 h sleep (sleep runs to 15:30 after the 30-minute buffer). A Daily 20:00 reminder arrives at 20:00. A message scheduled for 23:00 arrives at 15:30 the next day, May's next free moment. A message marked urgent arrives at 23:00.

### Tests for User Story 4 (write first, see them fail)

- [X] T064 [P] [US4] Write unit tests in src/server/notifications/bundle.test.ts for `bundle(rows, { inbox, bundleTitle })` (research R5). It returns one recipient's `PushPayload`, or `null`. `rows` are that recipient's claimed rows (`id`, `title`, `body`, `url`, `push`, `urgent`). `inbox` is `/s/inbox` or `/a/inbox`. `bundleTitle(n)` is the translated "{n} reminders", passed in so the function stays pure. Cases:
  - **One row**: the same payload `payloadOf` builds today. The title and body are the row's. The url is the row's link, or the inbox, with `?n=<id>` appended (`&n=` when the link already has a query). `tag` is the row id.
  - **Several rows**: the title is `bundleTitle(n)`. The body is the first three titles, urgent first, joined with " · ". The url is the inbox with no `?n=`. `tag` is `bundle`.
  - **Rows with `push` false** (data-model.md Notification.push) aren't counted or listed: one pushable row and one inbox-only row → the one-row payload.
  - **No pushable rows** → `null`.
- [X] T065 [P] [US4] Add timing cases to src/server/notifications/dispatch.test.ts (research R2, R5; FR-003, FR-017; SC-001–SC-003).

  **Helpers, added first**:
  - `sweep(userIds, ticks)`: calls `runFor` at each tick and records every push with its tick and the recipient (devices map endpoint → user).
  - `ticks(from, to, everyMinutes)`.
  - `expectNoBusyDelivery(userIds)`, for SC-002, in one SQL statement: no non-urgent row of these users has a `delivered_at` inside one of its recipient's `busy_segments` (data-model.md Notification.urgent, Notification.delivered_at).
  - `expectOnePushPerDelivery(sweepResult)`, for SC-003: each device gets at most one push per tick, and each user gets exactly as many pushes as there are ticks at which they had pushable rows delivered.

  A dispatcher run against the dev database is slow. Use 5-minute ticks only around the moments that matter and hourly ticks in between. Never leave a gap that contains a rule's time, because the 15-minute look-back would miss it. Keep each sweep under about 70 runs.

  (Done. A run takes about 5 s against the dev database, so 70 runs timed out. Instead of `ticks`, `on(date, ...times)` lists the runs that matter: the one that makes a row, the one before it is due, the one it is due in, and spot checks through the shift and sleep. The independent test is 13 runs. The US3 hand-over case now checks 17:45, not 17:55, as the last run before the hand-over. The shared rule and message helpers moved to the top of the file, unchanged.)

  Cases:
  - **Look-ahead**:
    - After the 19:50 run, a Daily 20:00 row exists, pending, with `deliver_at` 20:00. There is no push at 19:50 or 19:55. It is pushed at 20:00.
    - A message for 18:00 is handed over by the 17:50 run: the recipient's `delivered_at` is set and the status is `sent`. Its row is pending until 18:00, and the push goes out at 18:00 (data-model.md ScheduledMessageRecipient.delivered_at, ScheduledMessage.status).
  - **Pulled forward and bundled**:
    - A notice due now and a Daily due 5 minutes later → one push titled "2 reminders" now, and two inbox rows delivered now.
    - A Daily at 20:00 and a message at 20:05 → one push at 20:00.
    - Two items 15 minutes apart → two pushes.
    - One pushable row plus a "Copy me" copy → the one-row payload.
  - **Released together**: a notice and a message held by the same shift → one push when it ends, and two inbox rows.
  - **Not pulled while busy**: rows due in the next 10 minutes for a busy recipient keep their time and are held like any other row. An urgent row due now doesn't pull a busy recipient's other rows forward.
  - **Independent test**, as one sweep from 19:50 to 15:45 the next day: the Daily at 20:00, the 23:00 message at 15:30, and urgent at 23:00. Then `expectNoBusyDelivery` and `expectOnePushPerDelivery`.
  - **Scenario 4**: Streak at risk at 21:30, held by a shift from 21:00, lapses at midnight. No row is left and nothing is pushed.
  - **Scenario 5**: with no shift information, only waking hours and quiet hours hold (quiet hours through the `quietStart`/`quietEnd` columns, which US5 gives a screen).
  - **Admin's own hours**: Zin has quiet hours 22:00–07:00 and default waking hours. A notice for Zin recorded at 23:00 Yangon is delivered at 08:00 Yangon (FR-003; research R14; quickstart.md §4.9).

  Existing cases that assumed no row exists before its time: change them on purpose and say why in the test name or a comment. Don't loosen what they check.
- [X] T066 [P] [US4] Write a Playwright smoke test in tests/e2e/us4-held.spec.ts (390×844 and 1280×800, axe; constitution III). Use the fixtures `seedShift`, `seedNotification`, `seedMessage` (`urgent: true`) and `runDispatch`:
  - Seed a shift for May running now and a "Needs redo" notice, then `runDispatch`. May's bell reads 0 and the inbox is empty.
  - Seed an urgent message to May due now, then `runDispatch`. The bell reads 1 and the inbox lists the message (still not the notice).

  Exact times are checked in T065. This test checks the held and urgent paths through the real route and screens.

### Implementation for User Story 4

- [X] T067 [P] [US4] Implement `bundle` in src/server/notifications/bundle.ts, and move `payloadOf` out of dispatch.ts into it as the one-row case. T064 passes.
- [X] T068 [US4] Change src/server/notifications/dispatch.ts (research R2, R5). T065 passes, and every existing case in dispatch.test.ts and src/features/alerts/messages-repo.test.ts still passes.
  - **One constant**: `BUNDLE_MINUTES = 10` is used for both the look-ahead and the pull-forward.
  - **Step 1** (`createRuleOccurrences`): the window becomes `(now − 15 min, now + 10 min]`, and the after-shift data loads for that window too. Rows keep the occurrence instant as `deliver_at` (data-model.md Notification.deliver_at, Notification.expires_at). "A rule never fires for a moment before it existed" still holds.
  - **Step 2** (`handOverMessages`): claim recipients with `deliver_at ≤ now + 10 min`. Their rows keep the planned `deliver_at`, as `messageRow` already does. A message is `sent` once all its recipients are handed over (data-model.md ScheduledMessage.status). The repo's `message_already_sent` is unchanged.
  - **Availability step** (`holdForBusyRecipients`), still one statement:
    - Compute `next_free_at` for every recipient with a row due now, urgent rows included.
    - Move only non-urgent rows, as today.
    - For recipients free now, rows with `deliver_at` in `(now, now + 10 min]` move to `now` (pulled forward). They then pass `dropStale` like any due row (research R4).
    - Add no new field to the result: contracts/route-handlers.md › Cron is unchanged.
  - **Delivery** (`deliverDue`):
    - Group the claimed rows by recipient.
    - Build each recipient's payload with `bundle`, with the title from `textsFor(recipient).tr('pushTexts.bundleTitle', { n })`. (As built, `textsFor` is loaded for every recipient with a pushable row. It is cheap, and loading it lazily would only add a branch.)
    - Send that one payload to each of the recipient's devices. `pushes` counts successful sends. Copies and the weekly-summary email are unchanged.
  - **Record the decision** in the design docs:
    - specs/006-notifications/research.md R2 steps 1–2 (the windows) and R5 (where the rows due soon come from);
    - specs/006-notifications/data-model.md › Lifecycles › A scheduled message: handed over up to 10 minutes before `deliver_at`, and Edit and Cancel close then;
    - specs/006-notifications/contracts/server-actions.md › Messages: the same note on `message_already_sent`.
- [X] T069 [US4] Add `pushTexts.bundleTitle` (ICU plural `{n}`: "{n} reminders") to src/i18n/messages/en.json, my.json and ja.json. The body is the rows' own titles, so it needs no string.
- [X] T070 [US4] Run T064, T065 and all of dispatch.test.ts until they pass, then messages-repo.test.ts, then T066 on the :3100 build.

  (2026-11-23: T064 6/6; the US3 and US4 cases of dispatch.test.ts pass (17/17); messages-repo.test.ts, alerts repo.test.ts and the rest of src/server/notifications pass; T066 passes on mobile and desktop on the :3100 build; typecheck, lint and format are clean. One full-file run of dispatch.test.ts, made while the build and e2e ran against the same database, failed 6 US4 cases, which pass on their own. A full-file run on a quiet database then passed 48/48, so the failures came from the overlap.)

**Checkpoint**: the P1 stories are complete. Delivery meets SC-001–SC-003 for every source.

---

## Phase 7: User Story 5 – Student controls their own reminders (Priority: P2)

**Goal**: quiet hours for both roles under Me; students add personal daily reminders and see their Admin's rules read-only.

**Independent Test**: as May, set quiet hours 12:00–13:00 and add a personal reminder "Kanji 10 min" at 12:30 daily: it arrives at 13:00.

### Tests for User Story 5 (write first, see them fail)

- [X] T071 [P] [US5] Write unit tests in src/features/notifications/quiet-hours.test.ts for `quietHoursText({ role, start, end })` (research R14). Students: "While on shift + sleep" with no window, or "22:00–07:00 + shift and sleep". Admins: "Off" or the window. Include a window that crosses midnight.
- [X] T072 [P] [US5] Add tests to src/features/notifications/repo.test.ts (contracts/server-actions.md; data-model.md Profile.quiet_start, Profile.quiet_end, NotificationRule.owner_id, NotificationRule.student_id, NotificationRule.trigger). Cases:
  - **saveQuietHours**: works for both roles; same start and end → `quietSameTimes`; none clears both.
  - **savePersonalReminder**:
    - writes `owner_id = student_id = me`, `daily`, `channels ['push']`;
    - editing another student's reminder or an Admin rule → `rule_not_found`;
    - an Admin caller is refused by `requireRole('student')`: check that src/server/auth/guards.test.ts covers it.
  - **deletePersonalReminder**: own reminders only.
  - **getMyReminders**:
    - lists the student's own reminders and, under fromAdmin, the active Admin's rules for them and for All students;
    - leaves out another Admin's rules and rules from an unlinked Admin;
    - returns `[]` for both lists for Admins.
  - **dispatch.test.ts**: the US5 independent test (a 12:30 reminder arrives at 13:00 with quiet hours 12:00–13:00). A student's own reminders keep running after unlinking.
- [X] T073 [P] [US5] Write Playwright tests in tests/e2e/us5-my-reminders.spec.ts (390×844 and 1280×800, axe). Cases:
  - **Scenario 1**: the quiet hours sheet sets 12:00–13:00, and the Me row reads "12:00–13:00 + shift and sleep"; None brings back "While on shift + sleep".
  - **Scenario 3**: + Reminder adds "Kanji 10 min" at 12:30 every day; its switch turns it off.
  - **Scenario 2**: the Me row reads "n on".
  - **Scenario 4**: Zin's rules show "Set by Zin", with no switch and no edit.
  - **Admin**: the quiet hours row on `/a/me`.
  - **Access**: `GET /api/me/reminders` without a session → 401.

### Implementation for User Story 5

- [X] T074 [P] [US5] Implement `quietHoursText` in src/features/notifications/quiet-hours.ts. T071 passes.
- [X] T075 [US5] Add the following (T072 passes):
  - **Repo** (src/features/notifications/repo.ts): `saveQuietHours` (data-model.md Profile.quiet_start, Profile.quiet_end; both set or both null), `getMyReminders` (using `toRuleView`), `savePersonalReminder`, `deletePersonalReminder`. Personal-reminder `where`s use `ownerId: me.id, studentId: me.id, trigger: 'daily'` (data-model.md NotificationRule.owner_id, NotificationRule.student_id, NotificationRule.trigger: `daily` only), and the switch sets data-model.md NotificationRule.enabled.
  - **Actions** (src/features/notifications/actions.ts): `saveQuietHours` (`requireUser()`), `savePersonalReminder` and `deletePersonalReminder` (`requireRole('student')`).
  - **Schemas** (src/features/notifications/schemas.ts): built from `clockTime`, `weekday` and `ruleMessage`.
  - **Route Handler**: GET src/app/api/me/reminders/route.ts, with its `queryOptions` in src/features/notifications/queries.ts.

  (Done. As built:
  - `fromAdmin` lists the active Admin's **enabled** rules that reach the student. Rules that only alert the Admin (Inactive or Weekly summary sent to the Admin alone) are left out, because the student never gets them.
  - Turning a personal reminder off, or deleting it, drops its pending rows, as `setRuleEnabled` and `deleteRule` do for the Admin's rules.
  - `toClock`/`fromClock` moved from src/features/shifts/repo.ts to src/lib/time.ts (second use).
  - The days schema is exported from src/lib/notifications/rule-config.ts as `ruleDays`.)
- [X] T076 [US5] Build the components in src/features/notifications/components/ (contracts/ui-routes.md › Me; 11-Profile.png):
  - `QuietHoursSheet`: None, or From and To;
  - `MyReminders`: "Your reminders", each with a `Switch`, and + Reminder in a sheet (message, time, day toggles); "From {admin}", read-only with `ruleSummary` and "Set by {admin}".

  (Done: `QuietHoursRow`, `MyRemindersRow`, `MyReminders` and `PersonalReminderSheet`. Tapping a personal reminder opens the sheet with Delete. Alerts' `useRuleText`, the rule badge and the chip moved to src/components/shared/ (`use-rule-text.ts`, `rule-badge.tsx`, `choice-chip.tsx`), so both features use them without importing each other.)
- [X] T077 [US5] Create the page and rows:
  - src/app/s/(tabs)/me/reminders/page.tsx;
  - in src/features/profile/components/me-view.tsx: the "Quiet hours" row (both roles) and the "My reminders" row ("n on"; students only), in the Study section.

  (Done. The rows stay in features/notifications; the pages pass them to `MeView`:
  - **Students**: `reminderRows` now render below Weekly goal in Study, in 11-Profile.png's order: Shift calendar, Weekly goal, Quiet hours, My reminders, then Reminders on this device, which was above Weekly goal before.
  - **Admins**: Quiet hours joins Reminders on this device in their own Reminders section.)
- [X] T078 [US5] Add the `quietHours` and `myReminders` strings and `validation.quietSameTimes` to src/i18n/messages/en.json, my.json and ja.json.
- [X] T079 [US5] Run T071–T072 until they pass, and the independent test from T073 with `--grep` on the :3100 build.

  (2026-11-23: T071 5/5; repo.test.ts 15/15; the two US5 dispatch cases pass (the dispatcher already handled personal reminders, so they passed from the start); scenario 3 of T073 passes on mobile and desktop on the :3100 build. The other T073 cases run with the gates in T082.)

**Checkpoint**: all five stories work.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T080 [P] Update the docs (plan.md › Documentation updates):
  - **docs/data-model.md**: the delivery columns and their lifecycle, occurrence keys, `owner_id`, the dropped `read_at`, the new policies and CHECKs;
  - **docs/technical-spec.md §3**: `features/notifications`, `features/alerts`, `server/notifications`, `server/cron.ts`, `server/activity.ts`, `lib/notifications`, `public/sw.js`;
  - **docs/technical-spec.md §9**: the pipeline as built (look-back, lapse, re-check, bundling, every recipient's hours) and the deploy SQL;
  - **docs/technical-spec.md §15**: `RESEND_FROM`.
- [ ] T081 [P] Review every new `my` and `ja` string for completeness and tone, including no pronouns for students (FR-012). List the strings that need a native speaker under a `_review` note in specs/006-notifications/quickstart.md, as 004 and 005 did.
- [ ] T082 Run every gate from the package.json scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e` (all of us1-inbox, us2-rules, us3-messages, us4-held and us5-my-reminders on the :3100 production build), `pnpm build`.
- [ ] T083 [P] Accessibility and layout pass at 390×844 and 1280×800. Check:
  - 44 px targets (bell, switches, chips, tiles);
  - the bell's label with the count;
  - switches and chips labelled;
  - the rule editor and composer usable by keyboard;
  - theme tokens only.

  Fix findings in src/features/notifications/components/ and src/features/alerts/components/.

  Known (2026-11-23): at 390 px, `SettingsRow` (src/components/shared/settings.tsx) cuts off "Quiet hours" and "Shift calendar" ("Quiet ho…"). The label is `flex-1` with a zero basis, so the value takes the room. Make the value give way first.
- [ ] T084 Compare each changed screen at 390×844 with screenshots/24-AdminNotify.png, 25-AdminMessage.png, 26-AdminRule.png, 04-Today.png, 11-Profile.png and 16-AdminStudents.png. Fix layout, hierarchy and copy, keeping only the differences listed in contracts/ui-routes.md › Intentional differences.
- [ ] T085 Performance (plan.md › Performance Goals):
  - Lighthouse (mobile) ≥ 90 on `/a/alerts` and `/s/inbox`;
  - `/a/alerts` makes one request per chip;
  - the composer's availability check is one request;
  - with the Prisma query log, `dispatch` runs the same number of statements (≈12) for 2 and for 20 students.

  Record the results in specs/006-notifications/quickstart.md §5.
- [ ] T086 Walk through quickstart.md §4 scenarios 1–12. For each one, record the test that covers it or what wasn't checked. Real-phone push (scenarios 1, 2 and 10 on iPhone and Android) is a manual step for the user: list it as such.
- [ ] T087 Set **Status** to `Implemented` in specs/006-notifications/spec.md (constitution quality gate). Scheduling the dispatcher with `pg_cron` (quickstart.md §6) is a deploy step for the user, not part of this task.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none.
  - T001 before T009.
  - T003 before T024.
  - T004 before T023.
  - T005 before T042.
- **Foundational (2)**: after Setup; blocks every story.
  - T009 before T010.
  - T010 before every repo or dispatch test, because they need the generated client and the new columns.
  - T011–T016 before any story's actions or the dispatcher.
- **US1 (3)**: after Foundational. Builds the dispatcher, which US2–US4 extend.
- **US2 (4)**: after US1 (T023's dispatcher). The rule editor and Alerts don't depend on US1's screens, so US2's tests and pure modules (T035–T037, T040, T041) can start as soon as Foundational is done.
- **US3 (5)**: after US2 (T044's actions file, T045's queries, T046's `AlertsView`). T050, T051 and T054 can start after Foundational.
- **US4 (6)**: after US2 and US3, because its timing checks cover rules and messages and T068 changes their steps. T064 and T067 can start after Foundational.
- **US5 (7)**: after US1 (repo and Me rows) and T041 (`ruleSummary`). Independent of US3 and US4.
- **Polish (8)**: after the stories you're shipping.

### Within each story

Tests first and failing → pure modules → loaders and repo → actions and Route Handlers → components → pages → strings → the story's tests pass.

### Shared files (no [P] between these tasks)

- src/server/notifications/dispatch.ts: T023 → T043 → T057 → T067 (moves `payloadOf` out) → T068
- src/server/notifications/dispatch.test.ts: T018 → T038 → T052 → T065 → T072
- src/server/notifications/record.ts: T014 → T025
- src/features/notifications/repo.ts: T026 → T075
- src/features/notifications/repo.test.ts: T019 → T072
- src/features/notifications/actions.ts and schemas.ts: T027 → T075
- src/features/notifications/queries.ts: T028 → T075
- src/features/alerts/actions.ts and schemas.ts: T044 → T056
- src/features/alerts/queries.ts: T045 → T058
- src/app/api/alerts/route.ts: T045 → T061
- src/features/alerts/components/alerts-view.tsx: T046 → T061
- src/app/a/alerts/rules/new/page.tsx: T047 → T060
- src/features/profile/components/me-view.tsx: T027 → T032 → T077
- src/i18n/messages/*.json: T033, T048, T062, T069, T078 (one at a time)

### Parallel opportunities

- **Setup**: T004 and T005 together after T003.
- **Foundational**: tests T006–T008 together; then T011–T013 and T015–T017 together while T009 and T010 run in order; T014 after T010.
- **US1**: T018–T022 together; T029 alongside T026–T028.
- **US2**: T035–T039 together; T040 and T041 together.
- **US3**: T050–T053 together; T054 alongside T055.
- **US4**: T064, T065 and T066 together; then T067; then T068 (same file as T067's move).
- **US5**: T071–T073 together. US5 as a whole alongside US3 and US4, except for the message files and dispatch.test.ts.

---

## Parallel Example: Foundational tests

```bash
Task: "pgTAP supabase/tests/006_notification_policies.test.sql"
Task: "Rule config tests src/lib/notifications/rule-config.test.ts"
Task: "renderMessage tests src/lib/notifications/render.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "occurrences tests src/server/notifications/occurrences.test.ts"
Task: "ruleSummary tests src/lib/notifications/rule-summary.test.ts"
Task: "Alerts repo tests src/features/alerts/repo.test.ts"
Task: "Playwright tests/e2e/us2-rules.spec.ts"
# then
Task: "occurrences.ts" ; Task: "rule-summary.ts"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup and Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** with quickstart.md §4 scenarios 1–2 and 10. 003/004's notices and the Sunday check now reach students, and nothing is delivered during a shift.

### Incremental delivery

3. US2 (rules, lapse, weekly summary): scenarios 3, 5 and 11. MVP per CLAUDE.md is 001–004 + basic 006, which is US1 + US2.
4. US3 (messages, composer, urgent): scenarios 4 and 7.
5. US4 (bundling, SC-002/SC-003 across sources): scenarios 6 and 9.
6. US5 (quiet hours, My reminders): scenario 8.
7. Polish (scenario 12 in T086), then merge `006-notifications` into `main`. The user schedules the dispatcher with `pg_cron` per quickstart.md §6.

Implement in small batches (`/speckit-implement Phase 1`, `… T006–T008`, …), reviewing each diff and running tests before the next batch.

---

## Notes

- [P] = different files and no dependency on unfinished tasks.
- Every new Route Handler and Server Action starts with a guard. The dispatch route uses `requireCronSecret` instead (plan.md › Complexity Tracking).
- The three moves (T003–T005) are commits of their own with no behaviour change.
- Commit `schema.prisma` and the migration together (docs/data-model.md §7).
- Only the user schedules the dispatcher, from Supabase (quickstart.md §6). No task pushes to real phones or sends email outside the tests' recording senders.
- Commit after each task group.
