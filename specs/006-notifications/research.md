# Research: Notifications — Rules and Scheduled Messages

Phase 0 decisions for [plan.md](plan.md). Each one records what was chosen, why, and what was rejected. The spec was clarified on 2026-11-23 (6 answers); nothing is left as NEEDS CLARIFICATION.

## What exists already

- **Tables** (`0_init`): `notification_rules`, `scheduled_messages`, `scheduled_message_recipients`, `push_subscriptions` and `notifications` (the inbox and de-dupe log, unique on source, user and occurrence), with RLS. The schema has `next_free_at()` and `busy_segments()` (shift, sleep, outside waking hours, quiet hours), and 005 added `status_at()`. Profiles have `quiet_start` / `quiet_end`.
- **Notices**: 003 and 004 already write notices with `recordNotice()` (`src/server/notifications/record.ts`): a row in `notifications` with `source_type = 'system'`, its text in the recipient's language (`texts.ts`). A newer notice about the same item replaces the older one and is unread again.
- **Default rules**: 003 creates the default rule set on assignment (`notification_rules_default_once`, `config.preset = 'default'`).
- **Placeholders**: the Admin's Alerts tab is a placeholder, and the bell on Admin Students is a disabled button.
- **Environment**: `.env` already sets `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `CRON_SECRET` and `NEXT_PUBLIC_SITE_URL`.
- **Not installed**: there's no push library, no email client, no service worker and no web app manifest yet.

## R1. Every delivery is a `notifications` row with a delivery state

- **Decision**: one pipeline for everything. Rule reminders, one-off messages, notices, the Sunday check and the weekly summary all become `notifications` rows. Five columns are added:
  - `deliver_at`: when it may go out (default now; moved later while the recipient is busy);
  - `delivered_at`: set when it went out (null = pending);
  - `expires_at`: when a rule reminder lapses (FR-017); null = never;
  - `push`: whether a phone notification is sent (false for "Copy me" copies and for rules with push off);
  - `urgent`: skips the availability check (one-off messages only).

  The inbox shows delivered rows only, so a postponed item appears when it is delivered. `recordNotice` sets `deliver_at = now` and `delivered_at = null` on insert and on replace, so a replaced notice goes out again. Existing rows get `delivered_at = sent_at`: notices recorded before 006 sit in the inbox and aren't pushed late.
- **Rationale**: postponing, bundling, lapsing and de-duplication happen in one place, and the unique key already prevents duplicates (FR-004).
- **Alternatives**: a separate queue table (two places to read, and the inbox would need a join); computing rule reminders only at delivery time (a postponed reminder would be forgotten).

## R2. The dispatcher: one function, every 5 minutes

- **Decision**: `dispatch(now)` in `src/server/notifications/dispatch.ts`, called by `POST /api/cron/dispatch`. It works in four steps, each one set-based (a fixed number of SQL statements per run, whatever the number of users):
  1. **Rule occurrences**: insert a row for each rule occurrence due in `(now − 15 min, now]`. The 15-minute look-back covers a late or missed tick; `on conflict do nothing` keeps it to one.
  2. **Messages**: copy due `scheduled_message_recipients` (`deliver_at ≤ now`, not handed over yet) into rows; mark them handed over and the message `sent` once all its recipients are.
  3. **Availability**: for each recipient with pending rows due (`deliver_at ≤ now`), `next_free_at(user, now)` in one statement. When it is later than now:
     - non-urgent rows move to that time;
     - rows whose `expires_at` is at or before the new time are deleted (lapsed).
  4. **Delivery**: drop rows that lapsed or no longer apply (R4); then, per recipient, send one push for everything due, including rows due in the next 10 minutes (bundling, R5); set `delivered_at`; send the weekly-summary email.
- **Scheduling**: `pg_cron` + `pg_net` call the route every 5 minutes with `CRON_SECRET` from Supabase Vault (technical-spec §9; the SQL is already drafted at the end of `0_init`). The URL depends on the deployment, so it is a deploy step (quickstart §6), not a migration. Vercel Hobby crons run only daily. There's no scheduler in development: tests call `dispatch(now)` directly, and e2e calls the route with the secret.
- **Rationale**: SC-001 (within 5 minutes) with a bounded amount of work per run.
- **Alternatives**: Vercel Cron (5-minute schedules need a paid plan); Supabase Edge Functions (the constitution keeps server logic in Next.js).

## R3. Rule occurrences come from pure functions

- **Decision**: `src/features/notifications/occurrences.ts`, pure and unit-tested. For one rule and one student, it gives the occurrences in a window: instant, occurrence key, lapse time and the values for the template. All times are computed in the student's zone (date-fns tz).

  | Trigger | When | Occurrence key | Lapses (FR-017) | Needs |
  | --- | --- | --- | --- | --- |
  | `daily` | `time` on `days` (ISO 1–7), local | `YYYY-MM-DD` | end of that local day | – |
  | `after_shift` | shift end + `hours` | shift id | start of the next working shift | shifts ending in the window (005) |
  | `due_soon` | effective due − each of `offsets_h`, if not completed | `lessonId@dueISO#h` | the deadline | effective deadlines (003 `effective_due`), completion (004) |
  | `overdue` | at the deadline, then daily at `repeat_time`; `max` reminders in all, the one at the deadline included | `lessonId@dueISO#n` | the next repeat (the last one: end of that day) | same |
  | `streak_risk` | `time` daily, if nothing done that local day (004 FR-006) | `YYYY-MM-DD` | end of that local day | today's activity (004) |
  | `inactive` | `days` full local days without study, once per gap | the last active date | when the student studies again | last active date (004) |
  | `weekly_summary` | `weekday` + `time` | the Monday of the week | never | the week's activity, overdue work and next deadlines |

  Config shapes are Zod schemas in `src/lib/notifications/rule-config.ts` (moved there by tasks.md, because the dispatcher and both features use them). 003's default rules didn't fit: they had Daily on all 7 days and Overdue's time as `time`. The 006 migration fixes the stored rows, and 003 now takes the set from `DEFAULT_RULE_SET` (data-model.md › Migration). The defaults table is in data-model.md.
- **The data each run needs is loaded in batches**: active rules with their students, effective deadlines with completion, activity, and shifts ending in the window. About 5 statements.
- **Rationale**: the time rules are where bugs hide (constitution III), so they get table tests (Tokyo, Yangon +06:30, New York daylight saving).
- **Alternatives**: SQL for every trigger (hard to test, and it would hold a second copy of 004's activity rules).

## R4. "Still applies" is checked again at delivery (FR-011)

- **Decision**: just before a rule row goes out, its condition is checked again from the occurrence key:
  - `due_soon` / `overdue`: the lesson isn't completed, and its effective deadline still equals the one in the key (moved or removed → dropped);
  - `streak_risk`: still nothing done today;
  - `inactive`: still no study since the key's date.

  A row that no longer applies is deleted, like a lapsed one. One batched check per run, reusing R3's loaders.
- **Rationale**: a reminder held for hours mustn't nag about work that is already done.

## R5. Bundling and push payloads

- **Decision**: per recipient, one push per run for all rows due now plus those due within the next 10 minutes (they are pulled forward a little), so several items at once arrive as one notification (US4 scenario 3).
  - One row: its title and text, and its link.
  - Several: "{n} reminders", with the first titles in the body, opening the inbox.
  - Payload: `{ title, body, url, tag }`. `tag` is the row id (or `bundle`), so the phone replaces rather than stacks a repeated notification. TTL is 24 h. Each row is still its own inbox item.
- **Rationale**: Edge Cases (one notification for 3 things) with no extra state.

## R6. Sending push

- **Decision**:
  - **Library**: the `web-push` package with the VAPID keys from the environment, sending to every `push_subscriptions` row of the recipient (one try each).
  - **Expired devices**: a 404 or 410 deletes that subscription (Edge Cases).
  - **Other errors**: the row still counts as delivered, because the inbox has it; push services queue for offline devices themselves.
  - **Testing**: sending sits behind a small `PushSender` interface that tests replace with a recorder.
- **Rationale**: the standard Web Push protocol works on iOS 16.4+, Android and desktop with no vendor account.
- **Alternatives**: Firebase Cloud Messaging (a vendor SDK and account; not in the stack).

## R7. Service worker and manifest: the minimum for push; 008 adds the rest

- **Decision**: a hand-written `public/sw.js` with only `push` (show the notification) and `notificationclick` (focus an open window or open the URL). It also posts a message to open windows so the bell refreshes. It is registered when the user turns reminders on. A minimal `src/app/manifest.ts` (name, start URL, `display: standalone`, theme colours) lets iPhone users add the app to the Home Screen, which iOS needs for push.
  - 008 replaces `sw.js` with Serwist's `src/app/sw.ts` and keeps these two handlers (008 FR-005), and adds icons, caching and offline behaviour.
- **Rationale**: push can't ship without a service worker, and pulling 008's caching forward would grow this feature.
- **Alternatives**: setting up Serwist now (its precaching and offline rules are 008's decisions).

## R8. Turning reminders on, per device

- **Decision**: a client hook `useDeviceReminders()` reports the device's state: `unsupported`, `needs-install` (iPhone not in standalone mode), `denied`, `off` or `on`. It turns reminders on (register `sw.js`, ask permission, `pushManager.subscribe` with the VAPID public key, then the `savePushSubscription` action) or off (`unsubscribe`, then `deletePushSubscription`).
  - **Saving**: upsert by `endpoint`. When someone else signs in on the same device, the row moves to them, so a handed-over phone never gets the previous user's notifications.
  - **Signing out**: `signOut` receives this device's endpoint and deletes it first (FR-014).
  - **Where it shows**: a "Turn on reminders" card on Today (student) and Students (Admin) until the device is on or dismissed; a "Reminders on this device" row in Me.
- **Rationale**: US1 scenarios 1–3 and the clarified sign-out rule.

## R9. Inbox and bell

- **Decision**:
  - **Routes**: `/s/inbox` and `/a/inbox` (full screen, outside the tabs), one shared `Inbox` component; delivered rows, newest first, 30 per page. 90-day retention: the dispatcher deletes older rows once a day (the first run after 03:00 UTC).
  - **The bell**: on Today (student) and on Admin Students (replacing the disabled button). It shows the unread count from a small `GET /api/notifications/unread` query that refetches on focus and when the service worker posts a message.
  - **Reading**: tapping an item marks it read and opens its link. A tapped phone notification opens its URL with `?n=<id>`; a small client component marks that row read and removes the parameter (FR-007).
- **Rationale**: no Realtime needed: the bell matters when the app is opened or a push arrives.
- **Alternatives**: Realtime on `notifications` (another publication and channel for a number that changes at most every 5 minutes).

## R10. Rules: personal reminders and read-only Admin rules

- **Decision**: `notification_rules.admin_id` is renamed to `owner_id`, so a rule belongs to the Admin who made it, or to the student for a personal reminder (`owner_id = student_id`, trigger `daily` only). RLS:
  - `rules_admin` stays (now on `owner_id`), and also checks the Admin role (data-model.md › Migration);
  - `rules_student_own`: a student manages rules they own for themselves, `daily` only;
  - `rules_student_read`: also covers the student's Admin's "All students" rules.

  003's `assignCourse` writes `ownerId`. Students see their Admin's rules read-only (FR-016). "Copy me" is stored as the channel `copy`. "In-app" isn't a choice, because the inbox always gets it (FR-001).
- **Rationale**: one table and one occurrence engine for both kinds; the rename keeps the name honest.
- **Alternatives**: a separate personal-reminder table (a second engine); keeping `admin_id` for a student owner (misleading).

## R11. Messages: schedule, edit, cancel, read status

- **Decision**: `scheduleMessage` writes `scheduled_messages` plus one `scheduled_message_recipients` row per student. Each row's `deliver_at` is:
  - now, for "Now";
  - the quick or picked time, converted from the chosen clock (student's or Admin's);
  - for "Next free", that student's `next_free_at` at scheduling time.

  Edit and Cancel work until a recipient row is handed over (FR-006). Read status comes from the delivered `notifications` rows (`source_type = 'message'`). `scheduled_message_recipients.read_at` is dropped, so read status has one source. Messages to students who were unlinked are cancelled per recipient, and a message left with none is cancelled (Edge Cases).
- **Composer availability**: `GET /api/alerts/availability?students=…&at=…` returns, per student, whether that moment is free, a shift, sleep or quiet hours, and the next free moment. It is one statement over `busy_segments` / `next_free_at`, and gives the warning and the one-tap fix (US3 scenario 4).
- **Quick times**: a pure `quickTimes(now, zone)` function gives 15:00, 18:00 and 22:00 in the chosen clock, rolling past times to tomorrow (US3 scenario 3).

## R12. Text: variables, languages, names

- **Decision**: rule and message text is stored as the Admin wrote it. At delivery, `renderMessage(text, values)` fills `{name}` (the student's display name), `{lesson}`, `{course}` and `{due}` (in the student's zone and language), and leaves out an empty variable with its quotes (Edge Cases). Fixed texts (bundle titles, the Sunday check, the weekly summary, "Send test") come from the message files in the recipient's language, as `texts.ts` already does. Template chips in the composer are in the Admin's language.
- Student-facing and Admin-facing copy never uses pronouns for a student (FR-012).

## R13. Weekly summary and email

- **Decision**: the `weekly_summary` occurrence builds the content from 004's numbers (lessons done, study time, streak) and 003's (overdue work, the next 3 effective deadlines). For the Admin it is one line per student.
  - **Inbox**: one inbox row.
  - **Email**: through the `resend` package, sent to the account's sign-in address, read from `auth.users` with a raw query.
  - **Email body**: plain HTML built from the message files in the recipient's language, no React Email, with a link to the app.
  - **Sender**: a new `RESEND_FROM` variable; development uses Resend's test sender.
  - **Without an API key**, sending is skipped and logged (tests use a recorder).
- **Rationale**: FR-019; email is only for this summary (FR-001).

## R14. Quiet hours and the Admin's own hours

- **Decision**: a "Quiet hours" row in Me for both roles, opening a sheet with From / To (it may cross midnight) or None, saved on `profiles.quiet_start` / `quiet_end`.
  - **Student row**: "While on shift + sleep" with none set, or "22:00–07:00 + shift and sleep".
  - **Admin row**: "Off" or the window.

  `next_free_at` already treats quiet hours, waking hours, shifts and sleep as busy for any profile, so the Admin's deliveries wait for the Admin's own hours (constitution; FR-003) with no new SQL.

## R15. A shared cron-secret check (third use)

- **Decision**: `requireCronSecret(request)` in `src/server/cron.ts` (constant-time compare, 401 otherwise). Used by 002's purge, 005's rotations and the new dispatch route, as its own commit before the dispatcher.
- **Rationale**: the project extracts on the third copy.

## R16. Tests

- **Decision**:
  - **Unit tests first** (Vitest): `occurrences` (each trigger, lapse times, Tokyo / Yangon / New York daylight saving), `renderMessage`, `quickTimes`, `bundle`, quiet-hours text, Zod rule configs.
  - **Repo tests against the dev database**:
    - `dispatch(now)` with a recording `PushSender`: postponement around shifts and quiet hours (SC-002), urgent, bundling, lapsing, de-duplication on a re-run (SC-003), notices replaced, messages handed over and cancelled, unlinked students;
    - the rule and message actions;
    - `next_free_at` for an Admin.
  - **pgTAP**: the rename, the personal-rule and read policies, the new columns' defaults and backfill, no client inserts into `notifications`.
  - **Playwright** (production build on :3100):
    - US1: seeded rows plus a dispatch call → bell count, open, read;
    - US2: the Alerts list, toggle and edit, and "Send test" without a device;
    - US3: the composer (both clocks, roll to tomorrow, busy warning, Cancel send);
    - US5: quiet hours and a personal reminder.

    A real push to a phone isn't automated. The quickstart has a manual check on an iPhone and an Android phone.
- **Rationale**: constitution III; delivery timing is checked where it is decided (the dispatcher), not through a browser.

## R17. Out of scope

- Offline caching and what a tapped notification does offline (008).
- Themes and fonts (007).
- SMS, chat replies, notifications between Admins.
- Students muting Admin rules (clarified: not allowed).
