-- Spec 005 FR-006 and User Story 4: live status for a student.
-- status_at(student, at) is deterministic; status_now(student) = status_at(student, now()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- May: student in Asia/Tokyo, default waking hours 08:00–23:00, quiet hours 12:00–13:00, linked to Admin.
-- Other admin: not linked to May. Thant: student with no shifts entered.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'may@example.test',
   '{"role": "student", "display_name": "May", "timezone": "Asia/Tokyo"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@example.test',
   '{"role": "admin", "display_name": "Admin"}'),
  ('33333333-3333-3333-3333-333333333333', 'other-admin@example.test',
   '{"role": "admin", "display_name": "Other admin"}'),
  ('44444444-4444-4444-4444-444444444444', 'thant@example.test',
   '{"role": "student", "display_name": "Thant", "timezone": "Asia/Tokyo"}');

update public.profiles set quiet_start = '12:00', quiet_end = '13:00'
 where id = '11111111-1111-1111-1111-111111111111';

insert into public.student_links (student_id, admin_id, status)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'active');

-- Night shift Fri 20 Nov 22:00 → Sat 21 Nov 07:00 (Tokyo), then 30 min buffer + 8 h sleep = 07:30–15:30.
insert into public.shifts (student_id, type, start_at, end_at, sleep_minutes)
values ('11111111-1111-1111-1111-111111111111', 'night',
        '2026-11-20 22:00+09', '2026-11-21 07:00+09', 480);

-- ── States and next change time (server connection: no user token) ────────────────────────
select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 03:00+09') $$,
  $$ values ('on_shift'::text, '2026-11-21 07:00+09'::timestamptz) $$,
  'during a night shift: on_shift until the shift ends ("On night shift until 07:00")');

select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 10:00+09') $$,
  $$ values ('sleeping'::text, '2026-11-21 15:30+09'::timestamptz) $$,
  'in the sleep block after a shift: sleeping until it ends ("Sleeping until 15:30")');

select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 16:00+09') $$,
  $$ values ('free'::text, '2026-11-21 23:00+09'::timestamptz) $$,
  'free: until the next busy time (end of waking hours)');

select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-20 02:00+09') $$,
  $$ values ('sleeping'::text, '2026-11-20 08:00+09'::timestamptz) $$,
  'outside waking hours counts as sleeping, until waking hours start');

select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-20 12:30+09') $$,
  $$ values ('free'::text, '2026-11-20 22:00+09'::timestamptz) $$,
  'quiet hours do not change the state; the next change is the shift start');

select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 07:00+09') $$,
  $$ values ('sleeping'::text, '2026-11-21 15:30+09'::timestamptz) $$,
  'at the exact shift end the shift is over (segments are [start, end))');

select results_eq(
  $$ select state, until from public.status_at('44444444-4444-4444-4444-444444444444', '2026-11-20 02:00+09') $$,
  $$ values ('unknown'::text, null::timestamptz) $$,
  'no shifts entered: unknown with no change time ("No shift info")');

select results_eq(
  $$ select * from public.status_now('11111111-1111-1111-1111-111111111111') $$,
  $$ select * from public.status_at('11111111-1111-1111-1111-111111111111', now()) $$,
  'status_now is status_at at the current time');

-- ── Who may call it (user tokens) ─────────────────────────────────────────────────────────
set local role authenticated;

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select results_eq(
  $$ select state from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 03:00+09') $$,
  $$ values ('on_shift'::text) $$,
  'the student sees their own status');

set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select results_eq(
  $$ select state from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 03:00+09') $$,
  $$ values ('on_shift'::text) $$,
  'the linked admin sees the status');

set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select results_eq(
  $$ select state, until from public.status_at('11111111-1111-1111-1111-111111111111', '2026-11-21 03:00+09') $$,
  $$ values ('unknown'::text, null::timestamptz) $$,
  'an admin who is not linked learns nothing (unknown)');

set local role anon;
select throws_ok(
  $$ select * from public.status_at('11111111-1111-1111-1111-111111111111', now()) $$,
  '42501', null,
  'anonymous callers cannot run it');

reset role;
select * from finish();
rollback;
