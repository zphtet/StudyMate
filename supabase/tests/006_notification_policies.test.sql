-- Spec 006 FR-004, FR-013, FR-016, FR-020: what the database enforces for notifications, and who can
-- read or write rules (research.md R1, R10, R11; data-model.md › Migration). Second layer behind
-- the server guards (requireRole('admin') + requireAdminOf for rules and messages; requireRole('student')
-- with ownerId = studentId = the caller for personal reminders; requireUser() for the inbox).
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Zed: admin linked to Ann, and formerly to Cai (removed). Yuki: admin linked to Bob.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c6000000-0000-0000-0000-000000000001', 'z6@example.test', '{"role": "admin", "display_name": "Zed"}'),
  ('c6000000-0000-0000-0000-000000000002', 'y6@example.test', '{"role": "admin", "display_name": "Yuki"}'),
  ('c6000000-0000-0000-0000-000000000003', 'a6@example.test',
   '{"role": "student", "display_name": "Ann", "timezone": "Asia/Tokyo"}'),
  ('c6000000-0000-0000-0000-000000000004', 'b6@example.test',
   '{"role": "student", "display_name": "Bob", "timezone": "Asia/Tokyo"}'),
  ('c6000000-0000-0000-0000-000000000005', 'c6@example.test',
   '{"role": "student", "display_name": "Cai", "timezone": "Asia/Tokyo"}');

insert into public.student_links (student_id, admin_id, status) values
  ('c6000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000001', 'active'),
  ('c6000000-0000-0000-0000-000000000004', 'c6000000-0000-0000-0000-000000000002', 'active'),
  ('c6000000-0000-0000-0000-000000000005', 'c6000000-0000-0000-0000-000000000001', 'removed');

-- Zed: rule 81 for Ann, rule 82 for all students, rule 85 for Cai (before the unlink).
-- Yuki: rule 83 for all students. Ann: personal reminder 84.
insert into public.notification_rules (id, owner_id, student_id, trigger, config, message) values
  ('c6000000-0000-0000-0000-000000000081', 'c6000000-0000-0000-0000-000000000001',
   'c6000000-0000-0000-0000-000000000003', 'daily', '{"time": "20:00", "days": [1, 2, 3, 4, 5]}', 'Study'),
  ('c6000000-0000-0000-0000-000000000082', 'c6000000-0000-0000-0000-000000000001',
   null, 'streak_risk', '{"time": "21:30"}', 'Keep the streak'),
  ('c6000000-0000-0000-0000-000000000083', 'c6000000-0000-0000-0000-000000000002',
   null, 'daily', '{"time": "19:00", "days": [1, 2, 3, 4, 5]}', 'Study (Yuki)'),
  ('c6000000-0000-0000-0000-000000000084', 'c6000000-0000-0000-0000-000000000003',
   'c6000000-0000-0000-0000-000000000003', 'daily', '{"time": "12:30", "days": [1, 2, 3, 4, 5, 6, 7]}', 'Kanji 10 min'),
  ('c6000000-0000-0000-0000-000000000085', 'c6000000-0000-0000-0000-000000000001',
   'c6000000-0000-0000-0000-000000000005', 'daily', '{"time": "20:00", "days": [1, 2, 3, 4, 5]}', 'Study (Cai)');

insert into public.notifications (id, user_id, source_type, source_id, occurrence_key, title, body) values
  ('c6000000-0000-0000-0000-000000000091', 'c6000000-0000-0000-0000-000000000003', 'system',
   'c6000000-0000-0000-0000-000000000003', 'week-check@2026-11-30', 'Next week', 'Correct?');

-- ── Schema (data-model.md › Migration) ────────────────────────────────────────────────────
-- NotificationRule.owner_id: renamed from admin_id; the default-once index follows the column.
select has_column('public', 'notification_rules', 'owner_id', 'notification_rules has owner_id');
select hasnt_column('public', 'notification_rules', 'admin_id', 'notification_rules.admin_id is renamed');
select ok((select indexdef like '%(owner_id, student_id, trigger)%' from pg_indexes
            where indexname = 'notification_rules_default_once'),
  'notification_rules_default_once is on owner_id');
select is((select channels from public.notification_rules where id = 'c6000000-0000-0000-0000-000000000081'),
  array['push'], 'NotificationRule.channels defaults to push (the inbox always gets it; FR-001)');
select ok(not exists (select 1 from public.notification_rules where 'inapp' = any(channels)),
  'no rule keeps the old inapp channel');

-- Notification delivery state (research R1).
select ok((select deliver_at is not null and delivered_at is null and expires_at is null and push and not urgent
             from public.notifications where id = 'c6000000-0000-0000-0000-000000000091'),
  'a new notification is pending: deliver_at now, push on, not urgent, never lapses');
select has_index('public', 'notifications', 'notifications_pending', 'pending deliveries index');
select has_index('public', 'notifications', 'notifications_inbox', 'inbox index');
select has_index('public', 'notifications', 'notifications_user', 'notifications_user stays (SQL-only object)');
-- Backfill: every row recorded before 006 counts as delivered, so old notices aren't pushed late.
select ok(not exists (select 1 from public.notifications
                       where delivered_at is null
                         and sent_at < (select finished_at from public._prisma_migrations
                                         where migration_name like '%\_notifications' escape '\')),
  'notifications recorded before the migration are delivered');

-- ScheduledMessageRecipient.read_at: read status comes from the delivered notification (R11).
select hasnt_column('public', 'scheduled_message_recipients', 'read_at',
  'scheduled_message_recipients.read_at is dropped');

-- CHECKs: NotificationRule.message 1–500, ScheduledMessage.body 1–1000, personal rules are daily.
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, message)
     values ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000003', 'daily', '') $$,
  '23514', null, 'an empty rule message is refused');
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, message)
     values ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000003', 'daily', repeat('a', 501)) $$,
  '23514', null, 'a rule message of 501 characters is refused');
select lives_ok(
  $$ insert into public.scheduled_messages (admin_id, body, mode, send_at)
     values ('c6000000-0000-0000-0000-000000000001', repeat('a', 1000), 'fixed', now() + interval '1 hour') $$,
  'a message body of 1000 characters is allowed');
select throws_ok(
  $$ insert into public.scheduled_messages (admin_id, body, mode, send_at)
     values ('c6000000-0000-0000-0000-000000000001', repeat('a', 1001), 'fixed', now() + interval '1 hour') $$,
  '23514', null, 'a message body of 1001 characters is refused');
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, config, message)
     values ('c6000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000003', 'overdue',
             '{"repeat_time": "19:00", "max": 3}', 'Late') $$,
  '23514', null, 'a personal rule other than daily is refused (notification_rules_personal_daily)');

set local role authenticated;

-- ── Student Ann ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c6000000-0000-0000-0000-000000000003", "role": "authenticated"}';

-- Personal reminders (rules_student_own; FR-016, US5).
select lives_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, config, message)
     values ('c6000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000003', 'daily',
             '{"time": "07:00", "days": [1]}', 'Vocabulary') $$,
  'Ann adds a personal daily reminder');
select lives_ok(
  $$ update public.notification_rules set message = 'Kanji 15 min', enabled = false
     where id = 'c6000000-0000-0000-0000-000000000084' $$,
  'Ann edits and turns off her own reminder');
select throws_ok(
  $$ update public.notification_rules set trigger = 'streak_risk', config = '{"time": "21:30"}'
     where id = 'c6000000-0000-0000-0000-000000000084' $$,
  null, null, 'Ann cannot turn her reminder into another trigger');
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, message)
     values ('c6000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000004', 'daily', 'For Bob') $$,
  '42501', null, 'Ann cannot add a reminder for another student');
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, message)
     values ('c6000000-0000-0000-0000-000000000003', null, 'daily', 'For everyone') $$,
  '42501', null, 'Ann cannot add an All students rule');

-- Reading (rules_student_read): her Admin's rules for her and for all students, read-only.
select results_eq(
  $$ select id::text from public.notification_rules where id::text like 'c6000000-%' order by id $$,
  $$ values ('c6000000-0000-0000-0000-000000000081'), ('c6000000-0000-0000-0000-000000000082'),
            ('c6000000-0000-0000-0000-000000000084') $$,
  'Ann reads Zed''s rule for her, Zed''s All students rule and her own reminder');
select results_eq($$ select count(*)::int from public.notification_rules where owner_id = auth.uid() $$,
  array[2], 'Ann reads both of her own reminders');
select ok(not exists (select 1 from public.notification_rules where id = 'c6000000-0000-0000-0000-000000000083'),
  'Ann cannot read another Admin''s All students rule');
select is_empty(
  $$ update public.notification_rules set enabled = false
     where id in ('c6000000-0000-0000-0000-000000000081', 'c6000000-0000-0000-0000-000000000082') returning id $$,
  'Ann cannot turn off her Admin''s rules (FR-016)');
select is_empty(
  $$ delete from public.notification_rules where id = 'c6000000-0000-0000-0000-000000000081' returning id $$,
  'Ann cannot delete her Admin''s rule');

-- The inbox: own rows only, read but never inserted by a client.
select results_eq($$ select count(*)::int from public.notifications $$, array[1], 'Ann reads her notification');
select throws_ok(
  $$ insert into public.notifications (user_id, source_type, occurrence_key, title, body)
     values ('c6000000-0000-0000-0000-000000000003', 'system', 'x', 'Fake', 'Fake') $$,
  '42501', null, 'a client cannot insert a notification');
select lives_ok(
  $$ update public.notifications set read_at = now() where id = 'c6000000-0000-0000-0000-000000000091' $$,
  'Ann marks her notification read');

-- ── Student Cai (unlinked from Zed) ───────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c6000000-0000-0000-0000-000000000005", "role": "authenticated"}';
select is_empty($$ select id from public.notification_rules $$,
  'Cai reads none of Zed''s rules after the unlink, not even the one for Cai');
select is_empty($$ select id from public.notifications $$, 'Cai reads nobody else''s notifications');

-- ── Admin Zed ─────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c6000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, config, message)
     values ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000003', 'overdue',
             '{"repeat_time": "19:00", "max": 3}', 'Overdue') $$,
  'Zed adds a rule for linked Ann (rules_admin)');
select lives_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, config, message)
     values ('c6000000-0000-0000-0000-000000000001', null, 'weekly_summary',
             '{"weekday": 7, "time": "18:00", "to": ["student", "admin"]}', 'Week') $$,
  'Zed adds an All students rule');
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, message)
     values ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000004', 'daily', 'For Bob') $$,
  '42501', null, 'Zed cannot add a rule for Bob, who is not linked to Zed');
select throws_ok(
  $$ insert into public.notification_rules (owner_id, student_id, trigger, message)
     values ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000005', 'daily', 'For Cai') $$,
  '42501', null, 'Zed cannot add a rule for Cai after the unlink');
select is_empty(
  $$ update public.notification_rules set enabled = false where id = 'c6000000-0000-0000-0000-000000000084' returning id $$,
  'Zed cannot change Ann''s personal reminder');
select is_empty(
  $$ select id from public.notification_rules where id = 'c6000000-0000-0000-0000-000000000083' $$,
  'Zed cannot read Yuki''s rules');

-- Messages and recipients: policies unchanged (msgs_admin, msg_recipients_admin).
select lives_ok(
  $$ insert into public.scheduled_messages (id, admin_id, body, mode, send_at)
     values ('c6000000-0000-0000-0000-000000000071', 'c6000000-0000-0000-0000-000000000001',
             'Hi', 'fixed', now() + interval '1 hour') $$,
  'Zed schedules a message');
select lives_ok(
  $$ insert into public.scheduled_message_recipients (message_id, student_id, deliver_at)
     values ('c6000000-0000-0000-0000-000000000071', 'c6000000-0000-0000-0000-000000000003', now() + interval '1 hour') $$,
  'Zed adds Ann as its recipient');
select throws_ok(
  $$ insert into public.scheduled_message_recipients (message_id, student_id, deliver_at)
     values ('c6000000-0000-0000-0000-000000000071', 'c6000000-0000-0000-0000-000000000004', now()) $$,
  '42501', null, 'Zed cannot add Bob as a recipient');

-- ── Student Bob ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c6000000-0000-0000-0000-000000000004", "role": "authenticated"}';
select results_eq($$ select id::text from public.notification_rules $$,
  $$ values ('c6000000-0000-0000-0000-000000000083') $$,
  'Bob reads only his Admin Yuki''s All students rule (FR-020)');

select * from finish();
rollback;
