-- Spec 005 FR-001, FR-007, FR-008, FR-010: the shift and rotation rules the database enforces, and
-- who can read or write shifts (research.md R1–R4, R12; data-model.md › Migration). Second layer
-- behind the server guards (requireRole('student') with studentId from the caller; the Admin only
-- reads through 004's links-scoped cards and 003's requireAdminOf).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Zed: admin linked to Ann. Yuki: admin linked to Bob only. Ann, Bob, Cai: students in Tokyo.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c5000000-0000-0000-0000-000000000001', 'z5@example.test', '{"role": "admin", "display_name": "Zed"}'),
  ('c5000000-0000-0000-0000-000000000002', 'y5@example.test', '{"role": "admin", "display_name": "Yuki"}'),
  ('c5000000-0000-0000-0000-000000000003', 'a5@example.test',
   '{"role": "student", "display_name": "Ann", "timezone": "Asia/Tokyo"}'),
  ('c5000000-0000-0000-0000-000000000004', 'b5@example.test',
   '{"role": "student", "display_name": "Bob", "timezone": "Asia/Tokyo"}'),
  ('c5000000-0000-0000-0000-000000000005', 'c5@example.test',
   '{"role": "student", "display_name": "Cai", "timezone": "Asia/Tokyo"}');

insert into public.student_links (student_id, admin_id, status) values
  ('c5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 'active'),
  ('c5000000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000002', 'active');

-- Ann: rotation 71 (active), night shift 61 Fri 4 Dec 22:00 → Sat 07:00 with 8 h sleep.
-- Bob: rotation 72 (active), day shift 62. Cai: only an Off day on Thu 10 Dec.
insert into public.shift_patterns (id, student_id, sequence, start_date) values
  ('c5000000-0000-0000-0000-000000000071', 'c5000000-0000-0000-0000-000000000003', 'DDDONNOO', '2026-11-30'),
  ('c5000000-0000-0000-0000-000000000072', 'c5000000-0000-0000-0000-000000000004', 'DO', '2026-11-30');
insert into public.shifts (id, student_id, type, start_at, end_at, sleep_minutes) values
  ('c5000000-0000-0000-0000-000000000061', 'c5000000-0000-0000-0000-000000000003', 'night',
   '2026-12-04 22:00+09', '2026-12-05 07:00+09', 480),
  ('c5000000-0000-0000-0000-000000000062', 'c5000000-0000-0000-0000-000000000004', 'day',
   '2026-12-04 09:00+09', '2026-12-04 18:00+09', 0),
  ('c5000000-0000-0000-0000-000000000063', 'c5000000-0000-0000-0000-000000000005', 'off',
   '2026-12-10 00:00+09', '2026-12-11 00:00+09', 0);

-- ── Schema (data-model.md › Migration) ────────────────────────────────────────────────────
select has_column('public', 'profiles', 'shift_presets', 'profiles has shift_presets');
select has_column('public', 'profiles', 'shifts_confirmed_week', 'profiles has shifts_confirmed_week');
select has_column('public', 'shift_patterns', 'generated_until', 'shift_patterns has generated_until');
select hasnt_column('public', 'shift_patterns', 'presets', 'shift_patterns.presets is dropped (presets live on the profile)');
select has_index('public', 'shift_patterns', 'shift_patterns_one_active', 'one active rotation per student index');

select ok((select shift_presets = '{"D": ["09:00", "18:00"], "E": ["14:00", "23:00"], "N": ["22:00", "07:00"]}'::jsonb
             from public.profiles where id = 'c5000000-0000-0000-0000-000000000003'),
  'a new profile gets the default preset times (FR-002)');
select ok((select shifts_confirmed_week is null
             from public.profiles where id = 'c5000000-0000-0000-0000-000000000003'),
  'a new profile has not answered a Sunday check');

-- Shift.sleep_minutes: an Off day never has a sleep block (CHECK shifts_off_no_sleep).
select throws_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at, sleep_minutes)
     values ('c5000000-0000-0000-0000-000000000003', 'off', '2026-12-08 00:00+09', '2026-12-09 00:00+09', 480) $$,
  '23514', null, 'an Off day with a sleep block is refused');
-- Shift.type: Off is exempt from the overlap rule, so it can share a day with a working shift.
select lives_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000003', 'off', '2026-12-04 00:00+09', '2026-12-05 00:00+09') $$,
  'an Off day may overlap a working shift');

-- Shift.end_at: a working shift is at most 24 h (FR-001); an Off day is the whole local day, which
-- is 25 h on a daylight-saving fall-back day (research R2), so Off may be up to 25 h.
select lives_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000005', 'off', '2026-11-01 00:00-04', '2026-11-02 00:00-05') $$,
  'an Off day on a 25 h fall-back day is allowed');
select throws_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000005', 'custom', '2026-10-31 08:00-04', '2026-11-01 08:00-05') $$,
  '23514', null, 'a 25 h working shift is refused');
select throws_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000005', 'off', '2026-12-20 00:00+09', '2026-12-21 02:00+09') $$,
  '23514', null, 'an Off row longer than 25 h is refused');

-- ShiftPattern.active: at most one active rotation per student (FR-010).
select throws_ok(
  $$ insert into public.shift_patterns (student_id, sequence, start_date)
     values ('c5000000-0000-0000-0000-000000000003', 'NNOO', '2026-12-07') $$,
  '23505', null, 'a second active rotation is refused');
select lives_ok(
  $$ insert into public.shift_patterns (student_id, sequence, start_date, active)
     values ('c5000000-0000-0000-0000-000000000003', 'NNOO', '2026-12-07', false) $$,
  'an inactive rotation can sit beside the active one');

-- busy_segments: an Off day is free time (research R2).
select is_empty(
  $$ select 1 from public.busy_segments('c5000000-0000-0000-0000-000000000005',
                                        '2026-12-10 00:00+09', '2026-12-11 00:00+09')
     where kind in ('shift', 'sleep') $$,
  'an Off day adds no shift and no sleep segment');

set local role authenticated;

-- ── Student Ann ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c5000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.shifts (id, student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000064', 'c5000000-0000-0000-0000-000000000003', 'evening',
             '2026-12-06 14:00+09', '2026-12-06 23:00+09') $$,
  'a student adds their own shift');
select throws_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000004', 'day', '2026-12-06 09:00+09', '2026-12-06 18:00+09') $$,
  '42501', null, 'a student can''t add a shift for another student');
select results_eq(
  $$ with u as (update public.shifts set sleep_minutes = 0
                where id = 'c5000000-0000-0000-0000-000000000064' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'a student edits their own shift');
select results_eq(
  $$ with u as (update public.shifts set sleep_minutes = 0
                where id = 'c5000000-0000-0000-0000-000000000062' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a student can''t edit another student''s shift');
select results_eq(
  $$ with d as (delete from public.shifts where id = 'c5000000-0000-0000-0000-000000000062' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a student can''t delete another student''s shift');
select results_eq(
  $$ with d as (delete from public.shifts where id = 'c5000000-0000-0000-0000-000000000064' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'a student deletes their own shift');
select lives_ok(
  $$ insert into public.shift_patterns (student_id, sequence, start_date, active)
     values ('c5000000-0000-0000-0000-000000000003', 'EEOO', '2026-12-14', false) $$,
  'a student saves their own rotation');
select throws_ok(
  $$ insert into public.shift_patterns (student_id, sequence, start_date, active)
     values ('c5000000-0000-0000-0000-000000000004', 'EEOO', '2026-12-14', false) $$,
  '42501', null, 'a student can''t save a rotation for another student');
select results_eq(
  $$ select count(*)::int from public.shifts where student_id = 'c5000000-0000-0000-0000-000000000004' $$,
  $$ values (0) $$,
  'a student reads no other student''s shifts');
select results_eq(
  $$ select count(*)::int from public.shift_patterns where student_id = 'c5000000-0000-0000-0000-000000000004' $$,
  $$ values (0) $$,
  'a student reads no other student''s rotation');

-- ── Linked Admin Zed: reads Ann's, writes nothing (FR-008) ───────────────────────────────
set local request.jwt.claims to '{"sub": "c5000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select results_eq(
  $$ select count(*)::int from public.shifts where student_id = 'c5000000-0000-0000-0000-000000000003' $$,
  $$ values (2) $$,
  'a linked admin reads the student''s shifts (the night shift and the Off day)');
select results_eq(
  $$ select count(*)::int from public.shift_patterns where student_id = 'c5000000-0000-0000-0000-000000000003' $$,
  $$ values (3) $$,
  'a linked admin reads the student''s rotations');
select throws_ok(
  $$ insert into public.shifts (student_id, type, start_at, end_at)
     values ('c5000000-0000-0000-0000-000000000003', 'day', '2026-12-07 09:00+09', '2026-12-07 18:00+09') $$,
  '42501', null, 'a linked admin can''t add a shift for the student');
select results_eq(
  $$ with u as (update public.shifts set sleep_minutes = 0
                where id = 'c5000000-0000-0000-0000-000000000061' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a linked admin can''t edit the student''s shift');
select results_eq(
  $$ with d as (delete from public.shifts where id = 'c5000000-0000-0000-0000-000000000061' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a linked admin can''t delete the student''s shift');
select results_eq(
  $$ with u as (update public.shift_patterns set active = false
                where id = 'c5000000-0000-0000-0000-000000000071' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a linked admin can''t change the student''s rotation');
select results_eq(
  $$ select count(*)::int from public.shifts where student_id = 'c5000000-0000-0000-0000-000000000004' $$,
  $$ values (0) $$,
  'an admin reads no shifts of a student linked to someone else');

-- ── Unlinked Admin Yuki ───────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c5000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_eq(
  $$ select count(*)::int from public.shifts where student_id = 'c5000000-0000-0000-0000-000000000003' $$,
  $$ values (0) $$,
  'an unlinked admin reads none of the student''s shifts');
select results_eq(
  $$ select count(*)::int from public.shift_patterns where student_id = 'c5000000-0000-0000-0000-000000000003' $$,
  $$ values (0) $$,
  'an unlinked admin reads none of the student''s rotations');

-- ── Another student Bob ───────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c5000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select results_eq(
  $$ select count(*)::int from public.shifts where student_id = 'c5000000-0000-0000-0000-000000000003' $$,
  $$ values (0) $$,
  'another student reads none of Ann''s shifts');
select results_eq(
  $$ select count(*)::int from public.shift_patterns where student_id = 'c5000000-0000-0000-0000-000000000003' $$,
  $$ values (0) $$,
  'another student reads none of Ann''s rotations');

select * from finish();
rollback;
