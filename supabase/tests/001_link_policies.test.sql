-- Spec 001 FR-009 / SC-002: RLS on profiles, student_links and admin_invites (policies from 0_init).
-- Second layer behind the server guards: a user's own token must not reach other people's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Ann: student, actively linked to Xavier. Ben: student with a pending request to Xavier.
-- Xavier: admin. Yuki: admin with no students. (handle_new_user creates profiles + invites.)
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'ann@example.test', '{"role": "student", "display_name": "Ann"}'),
  ('a0000000-0000-0000-0000-000000000002', 'ben@example.test', '{"role": "student", "display_name": "Ben"}'),
  ('a0000000-0000-0000-0000-000000000003', 'xavier@example.test', '{"role": "admin", "display_name": "Xavier"}'),
  ('a0000000-0000-0000-0000-000000000004', 'yuki@example.test', '{"role": "admin", "display_name": "Yuki"}');

insert into public.student_links (id, student_id, admin_id, status) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'pending');

set local role authenticated;

-- ── Student Ann ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000001'), 1,
  'a student reads their own profile');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000003'), 1,
  'a student reads their linked admin''s profile');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'a student cannot read another student''s profile');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000004'), 0,
  'a student cannot read an admin they are not linked to');
select is((select count(*)::int from public.student_links), 1,
  'a student reads only their own links');
select is((select count(*)::int from public.admin_invites), 0,
  'a student cannot read any invite codes');
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'role cannot be changed',
  'the role cannot be changed after sign-up');
select throws_ok(
  $$ insert into public.student_links (student_id, admin_id)
     values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004') $$,
  '42501', null,
  'a student cannot create a link with their own token');

-- ── Student Ben (pending) ─────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "a0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000003'), 0,
  'a pending student cannot read the admin''s profile yet');
select throws_ok(
  $$ update public.student_links set status = 'active' where id = 'b0000000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'a student cannot approve their own request');
select lives_ok(
  $$ update public.student_links set status = 'removed' where id = 'b0000000-0000-0000-0000-000000000002' $$,
  'a student can withdraw their own request (status → removed)');
select is((select status::text from public.student_links where id = 'b0000000-0000-0000-0000-000000000002'), 'removed',
  'the withdrawal was saved');

-- ── Admin Xavier ──────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000001'), 1,
  'an admin reads an actively linked student''s profile');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'an admin cannot read a student who is not actively linked');
select is((select count(*)::int from public.student_links), 2,
  'an admin reads their own links');
select is((select count(*)::int from public.admin_invites where admin_id = 'a0000000-0000-0000-0000-000000000003'), 1,
  'an admin reads their own invite code');
select is((select count(*)::int from public.admin_invites where admin_id = 'a0000000-0000-0000-0000-000000000004'), 0,
  'an admin cannot read another admin''s invite code');

-- ── Admin Yuki (no students) ──────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "a0000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is((select count(*)::int from public.profiles where role = 'student'), 0,
  'an unlinked admin reads no student profiles');
select is((select count(*)::int from public.student_links), 0,
  'an unlinked admin reads no links');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000003'), 0,
  'an admin cannot read another admin''s profile');

-- ── Anonymous ─────────────────────────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select is((select count(*)::int from public.profiles), 0,
  'anonymous callers read no profiles');

reset role;
select * from finish();
rollback;
