-- Spec 006 Notifications (data-model.md › Migration; research R1, R10, R11). Generated with
-- `prisma migrate diff` (docs/data-model.md §7), then edited: Prisma wrote the rename as drop + add,
-- which would lose every rule, and can't express the policies, CHECKs, partial indexes or backfill.

-- ── notification_rules: owner_id (R10) ──────────────────────────────────────────────────
-- A rule belongs to the Admin who made it, or to the student for a personal reminder. The rename
-- carries the FK, rules_admin and notification_rules_default_once with it.
alter table public.notification_rules rename column admin_id to owner_id;
alter table public.notification_rules
  rename constraint notification_rules_admin_id_fkey to notification_rules_owner_id_fkey;

-- NotificationRule.channels: push and/or copy. "In-app" isn't a channel: the inbox always gets it
-- (FR-001), so 003's '{push,inapp}' default goes.
alter table public.notification_rules alter column channels set default array['push']::text[];
update public.notification_rules set channels = array_remove(channels, 'inapp');

-- 003 wrote the default set before 006 fixed its shape (006 FR-008, data-model.md › Config by
-- trigger): Daily is Mon–Fri, and Overdue's repeat time is `repeat_time`. No rule could be edited
-- before 006, so every default row still has 003's values.
update public.notification_rules
   set config = jsonb_set(config, '{days}', '[1, 2, 3, 4, 5]')
 where trigger = 'daily' and config->>'preset' = 'default';
update public.notification_rules
   set config = (config - 'time') || jsonb_build_object('repeat_time', config->'time')
 where trigger = 'overdue' and config ? 'time';

alter table public.notification_rules
  add constraint notification_rules_message_len check (char_length(message) between 1 and 500),
  -- A personal reminder (owner = student) is a daily-time reminder (spec Assumptions; R10).
  add constraint notification_rules_personal_daily check (owner_id <> student_id or trigger = 'daily');

-- Policies. rules_admin now also needs the Admin role: before, any user could create an "All
-- students" rule they owned (student_id null passed the check).
drop policy rules_admin on public.notification_rules;
create policy rules_admin on public.notification_rules for all
  using (owner_id = auth.uid() and current_role_is('admin'))
  with check (owner_id = auth.uid() and current_role_is('admin')
              and (student_id is null or is_admin_of(student_id)));

-- A student manages their own daily reminders (US5, FR-016).
create policy rules_student_own on public.notification_rules for all
  using (owner_id = auth.uid() and student_id = auth.uid() and trigger = 'daily'
         and current_role_is('student'))
  with check (owner_id = auth.uid() and student_id = auth.uid() and trigger = 'daily'
              and current_role_is('student'));

-- A student reads their active Admin's rules for them and for all students (FR-016, FR-020), and
-- nothing from an Admin they are no longer linked to (constitution I).
drop policy rules_student_read on public.notification_rules;
create policy rules_student_read on public.notification_rules for select
  using ((student_id = auth.uid() or student_id is null) and owner_id = my_admin_id());

-- ── scheduled_messages / recipients (R11) ────────────────────────────────────────────────
-- ScheduledMessage.body: 1–1000 characters (0_init allowed 500).
alter table public.scheduled_messages drop constraint scheduled_messages_body_check;
alter table public.scheduled_messages
  add constraint scheduled_messages_body_len check (char_length(body) between 1 and 1000);

-- Read status has one source: the delivered notifications row. Empty on dev (006 T001).
alter table public.scheduled_message_recipients drop column read_at;

-- ── notifications: the delivery state (R1) ───────────────────────────────────────────────
alter table public.notifications
  add column deliver_at   timestamptz not null default now(),
  add column delivered_at timestamptz,
  add column expires_at   timestamptz,
  add column push         boolean not null default true,
  add column urgent       boolean not null default false;

-- Notices recorded before 006 sit in the inbox as delivered and are never pushed late.
update public.notifications set deliver_at = sent_at, delivered_at = sent_at;

-- The dispatcher reads pending rows by time; the inbox reads a user's delivered rows, newest first.
-- notifications_user (0_init) stays.
create index notifications_pending on public.notifications (deliver_at) where delivered_at is null;
create index notifications_inbox
  on public.notifications (user_id, delivered_at desc) where delivered_at is not null;
