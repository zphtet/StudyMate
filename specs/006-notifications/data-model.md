# Data Model: Notifications — Rules and Scheduled Messages

The five notification tables and their RLS exist since `0_init` (docs/data-model.md §3). This feature adds a delivery state to `notifications` (research R1), renames `notification_rules.admin_id` to `owner_id` for personal reminders (R10), drops `scheduled_message_recipients.read_at` (R11) and adds RLS for students' own rules. Profiles already have `quiet_start` / `quiet_end`, waking hours, sleep and time zone (005).

## Entities

### NotificationRule (`notification_rules`) — changed

| Field | Type | Rule |
| --- | --- | --- |
| `id` | uuid | |
| `owner_id` | uuid → profiles | **renamed from `admin_id`**. The Admin who made it, or the student for a personal reminder (R10) |
| `student_id` | uuid → profiles, null | the student it applies to; null = all students linked to the owner at each occurrence (FR-020). A personal reminder has `student_id = owner_id` |
| `trigger` | `rule_trigger` | `daily`, `after_shift`, `due_soon`, `overdue`, `streak_risk`, `inactive`, `weekly_summary`. Personal reminders: `daily` only |
| `config` | jsonb | per trigger, validated by Zod (below); `preset: "default"` marks 003's default set |
| `message` | text | 1–500 characters; may use `{name}`, `{lesson}`, `{course}`, `{due}` (FR-005) |
| `channels` | text[] | `push` (phone notification) and/or `copy` (a copy in the owner's inbox, FR-018). The inbox always gets it (FR-001) |
| `enabled` | boolean | off: nothing is generated, and nothing missed is sent later (US2 scenario 4) |

**Config by trigger** (local times `HH:mm` in the student's zone; days ISO 1 = Monday … 7):

| Trigger | Config | Default set (003 FR-013 / spec FR-008) |
| --- | --- | --- |
| `daily` | `{ time, days: number[1..7] }` | `{ time: "20:00", days: [1,2,3,4,5] }` |
| `after_shift` | `{ hours: 0.5–12 }` | – |
| `due_soon` | `{ offsets_h: number[1..3] }`, each 1–72 | `{ offsets_h: [24, 2] }` |
| `overdue` | `{ repeat_time, max: 1–7 }`; `max` counts every reminder, the one at the deadline included (`max: 1` = only at the deadline) | `{ repeat_time: "19:00", max: 3 }` |
| `streak_risk` | `{ time }` | `{ time: "21:30" }` |
| `inactive` | `{ days: 1–14, to: ("student" \| "admin")[] }` | – |
| `weekly_summary` | `{ weekday: 1–7, time, to: ("student" \| "admin")[] }` | – |

### ScheduledMessage (`scheduled_messages`) — unchanged columns

`admin_id`, `body` (1–1000 characters, variables allowed), `lesson_id` (optional link), `mode` (`now` / `fixed` / `next_free`), `send_at` (null for `next_free`), `urgent`, `status`.

**Status**: `scheduled` → `sent` when every recipient is handed over; → `cancelled` by Cancel send or when no recipient is left (unlinked students' rows are deleted by the dispatcher; deleted students' rows go with their profile, and the dispatcher cancels a `scheduled` message that has no recipient rows). `sending` isn't used.

### ScheduledMessageRecipient (`scheduled_message_recipients`) — changed

| Field | Rule |
| --- | --- |
| `message_id`, `student_id` | primary key; the student must be linked to the message's Admin |
| `deliver_at` | the planned moment: now, the quick or picked time, or the student's next free time at scheduling (R11) |
| `delivered_at` | set when the dispatcher hands it over to a `notifications` row; Edit and Cancel are refused after that |
| ~~`read_at`~~ | **dropped**: read status comes from the delivered `notifications` row (one source) |

### PushSubscription (`push_subscriptions`) — unchanged

One row per device and user (`endpoint` unique). Saving an endpoint that another user had moves the row to the new user (R8). Deleted on turning reminders off, on sign-out on that device, and when the push service answers 404 or 410.

### Notification (`notifications`) — changed: the inbox, the log and the delivery queue

| Field | Type | Rule |
| --- | --- | --- |
| `user_id` | uuid | recipient |
| `source_type` | text | `rule`, `message`, `system` (003/004 notices and the Sunday check) |
| `source_id` | uuid | rule, message, or the item the notice is about |
| `occurrence_key` | text | per source (below); unique with source and user (FR-004) |
| `title`, `body`, `url` | text | rendered in the recipient's language and zone when the row is created (R12) |
| `sent_at` | timestamptz | when the row was recorded (unchanged meaning for 003/004) |
| **`deliver_at`** | timestamptz, default now() | **new**: earliest delivery; moved later while the recipient is busy (FR-003) |
| **`delivered_at`** | timestamptz, null | **new**: null = pending. The inbox lists delivered rows only |
| **`expires_at`** | timestamptz, null | **new**: a rule reminder lapses here (FR-017); null = never |
| **`push`** | boolean, default true | **new**: false = inbox only ("Copy me" copies, rules without push) |
| **`urgent`** | boolean, default false | **new**: skips the availability check (urgent messages only) |
| `read_at` | timestamptz, null | set when opened (FR-007) |

**Occurrence keys**:

| Source | Key |
| --- | --- |
| rule `daily`, `streak_risk` | local date `YYYY-MM-DD` |
| rule `after_shift` | the shift id |
| rule `due_soon` | `{lessonId}@{dueISO}#{hours}` |
| rule `overdue` | `{lessonId}@{dueISO}#{n}`, n = 0 at the deadline … `max` − 1 |
| rule `inactive` | `inactive@{lastActiveDate}`; the Admin's row (`to: admin`) is `{studentId}:inactive@{lastActiveDate}`, so an "All students" rule alerts once per student |
| rule `weekly_summary` | `week@{mondayDate}`; with `to: admin`, one combined row per rule and week for the Admin, one line per student |
| a "Copy me" copy | `{studentId}:{key of the student's row}` (the owner's own row) |
| message | `message` |
| system (003/004) | unchanged: `assigned`, `deadline`, `submitted`, `reviewed` |
| system (Sunday check) | `week-check@{mondayDate}`, `source_id` = the student |

Rows for the Admin from `to: admin` follow the rule's `push` channel and wait for the Admin's own hours (FR-003). "Copy me" copies are inbox only (FR-018).

## Derived values

- **Unread count**: delivered rows of the user with `read_at` null.
- **Read status of a message** (Alerts): per recipient, from the `notifications` row (`source_type = 'message'`, `source_id` = message): `scheduled` while there is no row or the row is still pending (held because the student is busy), `delivered` once the row's `delivered_at` is set, `read` once its `read_at` is set. A held recipient stays `scheduled` on Alerts, but Edit and Cancel are refused once it is handed over (ScheduledMessageRecipient.delivered_at).
- **Is a moment busy** for a recipient: `next_free_at(user, at) > at`. It covers shift, sleep, outside waking hours and quiet hours, for students and Admins (R14). The composer shows which kind from `busy_segments`.

## Lifecycles

### A delivery (`notifications` row)

```text
recorded (deliver_at, delivered_at null)
  ├─ recipient busy, not urgent ─► deliver_at = next free moment
  ├─ expires_at ≤ next moment, or no longer applies (R4) ─► deleted (lapsed; never in the inbox)
  └─ due and free (or urgent) ─► delivered (push to every device if push, email for the weekly summary)
delivered ─open─► read
a newer notice for the same item (003/004) ─► text replaced, deliver_at = now, delivered_at and read_at null
older than 90 days ─► deleted
```

### A scheduled message

```text
scheduled ─edit─► scheduled          (each recipient row until handed over)
scheduled ─cancel / no recipient left─► cancelled
each recipient: deliver_at reached ─► handed over (delivered_at) ─► a notifications row (above)
all recipients handed over ─► sent
```

### A device

```text
off ─turn on (permission granted)─► on ─turn off / sign out / 404·410 / another user saves it─► off (row deleted or moved)
```

## Migration (`<UTC timestamp>_notifications`)

- `notification_rules`: rename `admin_id` → `owner_id` (the RLS policies and `notification_rules_default_once` follow the column). Add policies:
  - `rules_student_own`: for all, using / with check `owner_id = auth.uid() and student_id = auth.uid() and trigger = 'daily'`;
  - replace `rules_student_read`: select where `student_id = auth.uid()`, or `student_id is null` and the owner is the student's active Admin.

  `rules_admin` keeps its check (`student_id is null or is_admin_of(student_id)`), which a student never passes for themselves.
- `notifications`: add `deliver_at timestamptz not null default now()`, `delivered_at timestamptz`, `expires_at timestamptz`, `push boolean not null default true`, `urgent boolean not null default false`.
  - Backfill `delivered_at = sent_at` and `deliver_at = sent_at` for existing rows.
  - Indexes: `notifications_pending (deliver_at) where delivered_at is null`, and `notifications_inbox (user_id, delivered_at desc) where delivered_at is not null`. `notifications_user` stays (SQL-only object).
- `scheduled_message_recipients`: drop `read_at` (empty on dev; checked at migration time).
- CHECKs:
  - `notification_rules_message_len`: 1–500;
  - `scheduled_messages_body_len`: 1–1000;
  - `notification_rules_personal_daily`: `owner_id <> student_id or trigger = 'daily'`.
- pgTAP `supabase/tests/006_notification_policies.test.sql` covers:
  - the rename;
  - personal rules (own daily only; not another trigger; not for someone else);
  - a student reading the Admin's "All students" rules and not another Admin's;
  - no client insert into `notifications`;
  - the backfill;
  - recipients' policies unchanged.

## Guards (Prisma bypasses RLS)

| Data | Guard | Scope in every `where` |
| --- | --- | --- |
| Own devices, inbox, quiet hours | `requireUser()` | `userId: me.id` |
| Personal reminders | `requireRole('student')` | `ownerId: me.id, studentId: me.id, trigger: 'daily'` |
| Admin rules, messages, read status, composer availability | `requireRole('admin')` + `requireAdminOf(studentId)` for each named student | `ownerId` / `adminId: me.id` |
| Dispatcher | `requireCronSecret` (R15) | none: it serves every user |
