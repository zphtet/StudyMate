# Implementation Plan: Notifications — Rules and Scheduled Messages

**Branch**: `006-notifications` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-notifications/spec.md`, clarified on 2026-11-23 with six answers:
- students can't mute their Admin's rules;
- a held rule reminder lapses once it no longer applies;
- "Copy me" goes to the Admin's inbox only;
- the weekly summary's contents;
- "All students" rules cover students linked later;
- signing out stops notifications on that device.

The constitution also requires that the Admin's own notifications wait for the Admin's quiet and waking hours. Five screenshot details are left out or changed on purpose (contracts/ui-routes.md).

## Summary

Notifications reach students and Admins on every device they turn on, and always in an in-app inbox (the bell). Admins set automatic rules per student or for all students: daily, after a shift, due soon, overdue, streak at risk, inactive, weekly summary. They also send or schedule one-off messages, with templates, a linked lesson and both clocks. Nothing reaches a student during a shift, sleep, outside waking hours or in quiet hours unless it is urgent. Several items at once arrive as one notification, and a held reminder that no longer applies lapses. Students set quiet hours and their own daily reminders and see their Admin's rules read-only. 006 also delivers what 003–005 already record: assignment and deadline notices, submission and review notices, and the Sunday shift check.

The tables, their RLS and the availability SQL (`busy_segments`, `next_free_at`) exist since `0_init`; 003 creates the default rules and 003/004 record notices. The feature adds:
- a migration (research R1, R10, R11):
  - delivery state on `notifications` (`deliver_at`, `delivered_at`, `expires_at`, `push`, `urgent`; old rows backfilled as delivered);
  - `notification_rules.admin_id` → `owner_id` for personal reminders;
  - `scheduled_message_recipients.read_at` dropped;
  - policies for students' own and read-only rules;
- a dispatcher, `dispatch(now)`, called every 5 minutes by `pg_cron` → `POST /api/cron/dispatch`. It turns rule occurrences and due messages into rows, holds them for busy recipients, drops lapsed ones, bundles, and sends web push and the weekly email (R2–R6, R13);
- pure, unit-tested modules: `occurrences` (every trigger, in the student's zone), `renderMessage`, `quickTimes`, `bundle`;
- `public/sw.js` (push and click only) and a minimal `app/manifest.ts`, so phones can receive push; 008 builds on both (R7);
- screens: the bell and inbox, "Turn on reminders", Alerts, the rule editor, the composer, Quiet hours and My reminders (contracts/ui-routes.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies**:
- New: `web-push` (+ `@types/web-push`, dev) to send Web Push with the VAPID keys (technical-spec §9); `resend` for the weekly email (constitution: Resend).
- Existing: Next.js 16.4, React 19.3, Prisma 7.10, TanStack Query 5, Zod 4, next-intl 4, Tailwind CSS 4.3, shadcn/ui (`sheet`, `toggle-group`, `alert-dialog`, `checkbox`; `switch` is added with the shadcn CLI for the rule toggles), `date-fns` 4 + `@date-fns/tz`.

**Storage**:
- Supabase Postgres via Prisma: `notifications` (inbox, log and queue), `notification_rules`, `scheduled_messages` (+ recipients), `push_subscriptions`, `profiles.quiet_start/quiet_end`. `next_free_at()` and `busy_segments()` are read with `$queryRaw`, one statement per run or request.
- `pg_cron` + `pg_net` call the dispatcher (a deploy step, quickstart §6).
- No Storage, no Realtime.

**Testing**:
- pgTAP: the rename, students' own and read-only rules, the new columns and backfill, no client inserts.
- Vitest: unit tests first for `occurrences` (Tokyo, Yangon +06:30, New York daylight saving), `renderMessage`, `quickTimes`, `bundle` and the rule-config schemas. Repo tests against the dev DB for `dispatch(now)` with a recording push sender: SC-002 held deliveries, urgent, bundling, lapsing, SC-003 de-duplication, notices, messages, unlinked students. Plus the actions.
- Playwright: US1, US2, US3 and US5 screens, plus a US4 smoke test (held and urgent through the bell), at 390×844 and 1280×800 with axe, on a production build on :3100. Delivery timing is tested in the repo tests, not the browser. Real phones are a manual quickstart step.

**Target Platform**: mobile browsers first (iOS Safari 16.4+ as a Home Screen app, Android Chrome), then desktop; Vercel; Supabase `pg_cron`.

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- 99% of deliveries within 5 minutes of their due or released time (SC-001): one run every 5 minutes, and a fixed number of SQL statements per run (about 12), whatever the number of users.
- Scheduling a message with a template and a quick time takes under 20 s (SC-004): the composer opens with its data seeded and checks availability in one request.
- `/a/alerts` is one request per student chip; the bell's count is a single indexed count.
- Lighthouse performance ≥ 90 on `/a/alerts` and `/s/inbox` (mobile).

**Constraints**:
- no local Supabase or Docker, so `pg_cron` can't reach a local server: tests call `dispatch(now)` directly;
- Prisma bypasses RLS, so guards come first;
- rule times are evaluated in the student's zone; the Admin sees both clocks;
- each occurrence is delivered at most once (unique key);
- no pronouns for students in any language (003 FR-014);
- offline behaviour is 008's.

**Scale/Scope**: an Admin has a few dozen students with ~5 rules each; a student gets a handful of items a day; the inbox keeps 90 days. Screens: 4 new routes for the Admin (Alerts replaced, rule editor, composer, inbox), 2 new for students (inbox, My reminders), and changes to Today, Me (both roles) and Admin Students. Everything in 3 languages.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 006 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. Admin actions check `requireAdminOf` for each student named; rows match `ownerId` / `adminId: me.id`. Students write only personal daily reminders, their quiet hours and their devices. New RLS mirrors the guards (personal rules, read-only Admin rules); pgTAP covers them. | ✅ | ✅ |
| II. Spec first | 6 recorded clarifications; screenshot differences listed in contracts/ui-routes.md. | ✅ | ✅ |
| III. Test-first | Unit tests before each pure module; dispatcher repo tests for SC-001–SC-003; pgTAP for the migration; one Playwright spec per user story (US4: a smoke test of held and urgent delivery). | ✅ | ✅ |
| IV. Time | "Notifications are never delivered while the recipient is on shift or in a sleep/quiet block": `next_free_at` for every recipient, Admins included (R14), unless urgent. Rule times are in the student's zone (daylight saving via instants); the composer shows both clocks. | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | 390 px first; 44 px targets; the bell has a full label with the count; switches and chips are labelled; theme tokens only. | ✅ | ✅ |
| VI. Three languages | Every text in `en`/`my`/`ja`. Notification text is rendered in the recipient's language and zone (R12); templates are in the Admin's language. | ✅ | ✅ |
| VII. Stack | Prisma for every table and function call; reads via Route Handlers + `queryOptions`; writes via Server Actions + Zod; the dispatcher is a Route Handler called by `pg_cron` + `pg_net` (constitution); Resend for email; `web-push` as technical-spec §9 names. The service worker is a minimal hand-written file until 008 brings Serwist (Complexity Tracking). | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db and build pass; screenshots matched; spec status updated; the manifest makes the app installable (a gate 008 completes). | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| Turn reminders on/off on own devices; read and mark own inbox | ✓ | ✓ | `requireUser()` + `userId: me.id` |
| Set own quiet hours | ✓ | ✓ | `requireUser()` |
| Personal daily reminders | ✓ own | – | `requireRole('student')` + `ownerId = studentId = me.id`, `trigger: 'daily'` |
| See the Admin's rules that apply to them | ✓ read-only | – | `requireRole('student')` + active link |
| Create, edit, turn off, delete rules; send test | – | ✓ own rules, linked students | `requireRole('admin')` + `requireAdminOf` |
| Schedule, edit, cancel messages; read status; composer availability | – | ✓ linked students | `requireRole('admin')` + `requireAdminOf` each |
| Dispatch | cron only | cron only | `requireCronSecret` (R15) |

## Project Structure

### Documentation (this feature)

```text
specs/006-notifications/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R17
├── data-model.md        # entities, keys, lifecycles, migration, guards
├── quickstart.md        # prerequisites, commands, manual scenarios, deploy step
├── checklists/requirements.md
├── contracts/
│   ├── route-handlers.md
│   ├── server-actions.md
│   └── ui-routes.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
public/sw.js                                   # push + notificationclick only (R7)
src/
├── app/
│   ├── manifest.ts                            # minimal, installable (R7)
│   ├── s/inbox/page.tsx · a/inbox/page.tsx    # inbox (full screen)
│   ├── s/(tabs)/today/page.tsx                # + bell, Turn on reminders card
│   ├── s/(tabs)/me/page.tsx · me/reminders/page.tsx   # + reminders rows; My reminders (new)
│   ├── a/(tabs)/alerts/page.tsx               # replaces the placeholder
│   ├── a/alerts/rules/new · [ruleId] · messages/new · [messageId]/page.tsx   # full screen
│   ├── a/(tabs)/students/page.tsx             # bell on; Turn on reminders card
│   ├── a/(tabs)/me/page.tsx                   # + reminders and quiet hours rows
│   └── api/
│       ├── notifications/route.ts · unread/route.ts
│       ├── me/reminders/route.ts
│       ├── alerts/route.ts · rules/[ruleId]/route.ts · messages/[messageId]/route.ts · availability/route.ts
│       └── cron/dispatch/route.ts
├── features/notifications/                    # everyone: devices, inbox, quiet hours, personal reminders
│   ├── actions.ts · queries.ts · schemas.ts (+ .test) · types.ts · repo.ts (+ .test)
│   ├── occurrences.ts · render.ts · bundle.ts (each + .test)     # pure
│   ├── use-device-reminders.ts
│   └── components/   # Bell, Inbox, TurnOnRemindersCard, InstallGuideSheet, QuietHoursSheet,
│                     # MyReminders, MarkReadOnOpen
├── features/alerts/                           # the Admin: rules and messages
│   ├── actions.ts · queries.ts · schemas.ts (+ .test) · repo.ts (+ .test)
│   ├── quick-times.ts (+ .test) · rule-summary.ts (+ .test)       # pure
│   └── components/   # AlertsView, RuleRow, RuleEditor, Composer, ScheduledMessageCard
├── server/
│   ├── cron.ts                                # requireCronSecret (R15; purge and rotations use it too)
│   └── notifications/
│       ├── record.ts                          # + deliver_at / delivered_at reset on replace
│       ├── texts.ts                           # unchanged
│       ├── dispatch.ts (+ .test)              # the pipeline (R2–R5)
│       ├── push.ts                            # PushSender: web-push, 404/410 cleanup (R6)
│       └── email.ts                           # weekly summary via Resend (R13)
├── features/assignments/repo.ts               # default rules: adminId → ownerId
├── features/progress/components/student-progress-card.tsx   # + Send a nudge
├── features/profile/components/me-view.tsx    # + rows (both roles)
├── features/auth/actions.ts                   # signOut({ endpoint })
└── i18n/messages/{en,my,ja}.json              # inbox, reminders, alerts, ruleEditor, composer,
                                               # pushTexts, weeklySummary, errors.*, validation.*

prisma/
├── schema.prisma                              # Notification + 5 fields; NotificationRule.ownerId; − recipients.readAt
└── migrations/<UTC timestamp>_notifications/migration.sql

supabase/tests/006_notification_policies.test.sql
tests/e2e/us1-inbox · us2-rules · us3-messages · us5-my-reminders .spec.ts
tests/e2e/fixtures/notifications.ts            # seed rules, messages, delivered rows
```

**Structure Decision**: One Next.js app, as in 001–005.
- **Two feature folders**, so each stays one concern: `features/notifications` holds what every user has (devices, inbox, quiet hours, personal reminders), and `features/alerts` holds the Admin's rules and messages.
- **`server/notifications`**: the dispatcher lives next to `record.ts` and `texts.ts`, because 003 and 004 already write there and it serves every feature.
- **Availability stays in SQL** (`next_free_at`, `busy_segments`).
- **Composition**: Today, Me and Admin Students compose the new components, as 004 and 005 did.
- **`requireCronSecret`** is extracted first, as its own commit (third use).

**Documentation updates in this feature**:
- `docs/data-model.md`: the delivery columns and their lifecycle, occurrence keys, `owner_id`, the dropped `read_at`, the new policies and CHECKs.
- `docs/technical-spec.md`:
  - §3: `features/notifications`, `features/alerts`, `server/notifications`, `server/cron.ts`, `public/sw.js`;
  - §9: the pipeline as built (look-back window, lapse, bundling, every recipient's hours) and the deploy SQL;
  - §15: `RESEND_FROM`.
- `specs/006-notifications/spec.md`: Status → Implemented when done.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| A hand-written `public/sw.js` instead of Serwist (constitution VII) | Push needs a service worker now; Serwist's precaching and offline rules are 008's decisions | Setting up Serwist here would pull 008's caching design forward; 008 moves these two handlers into its `sw.ts` (008 FR-005). |
| Renaming `notification_rules.admin_id` to `owner_id` | Personal reminders are rules owned by the student (R10) | Keeping `admin_id` would store a student in a column named for Admins; a second table would need a second occurrence engine. |
| Dropping `scheduled_message_recipients.read_at` | Read status has one source: the delivered `notifications` row (R11) | Keeping both would need two writes per read and could disagree. The column is empty on dev (checked in the migration task). |
| A cron Route Handler without a user guard | The dispatcher serves every user, with no session | Same pattern and secret check as 002 and 005, now shared (`requireCronSecret`). |
