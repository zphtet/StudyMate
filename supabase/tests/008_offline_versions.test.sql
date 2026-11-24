-- Spec 008 data-model.md › pgTAP: the two columns the offline queue relies on (research R7), and
-- that the existing student policies still keep one student off another's rows with them set.
-- Second layer behind /api/sync's guards (requireRole('student'), requireLessonReader, and every
-- where scoped to studentId).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Xia: admin with course 11 and lesson 31, assigned to Ann and Bob. Ann and Bob: students.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c8000000-0000-0000-0000-000000000001', 'x8@example.test', '{"role": "admin", "display_name": "Xia"}'),
  ('c8000000-0000-0000-0000-000000000003', 'a8@example.test',
   '{"role": "student", "display_name": "Ann", "timezone": "Asia/Tokyo"}'),
  ('c8000000-0000-0000-0000-000000000004', 'b8@example.test',
   '{"role": "student", "display_name": "Bob", "timezone": "Asia/Tokyo"}');

insert into public.student_links (student_id, admin_id, status) values
  ('c8000000-0000-0000-0000-000000000003', 'c8000000-0000-0000-0000-000000000001', 'active'),
  ('c8000000-0000-0000-0000-000000000004', 'c8000000-0000-0000-0000-000000000001', 'active');
insert into public.courses (id, owner_id, title, status, is_personal) values
  ('c8000000-0000-0000-0000-000000000011', 'c8000000-0000-0000-0000-000000000001', 'Grammar', 'active', false);
insert into public.course_assignments (course_id, student_id, assigned_by, status) values
  ('c8000000-0000-0000-0000-000000000011', 'c8000000-0000-0000-0000-000000000003', 'c8000000-0000-0000-0000-000000000001', 'active'),
  ('c8000000-0000-0000-0000-000000000011', 'c8000000-0000-0000-0000-000000000004', 'c8000000-0000-0000-0000-000000000001', 'active');
insert into public.lessons (id, course_id, title, status, position) values
  ('c8000000-0000-0000-0000-000000000031', 'c8000000-0000-0000-0000-000000000011', 'Particles', 'published', 0);

-- Bob's draft 41 and Bob's shift 61.
insert into public.submissions (id, student_id, lesson_id, status) values
  ('c8000000-0000-0000-0000-000000000041', 'c8000000-0000-0000-0000-000000000004',
   'c8000000-0000-0000-0000-000000000031', 'draft');
insert into public.shifts (id, student_id, type, start_at, end_at) values
  ('c8000000-0000-0000-0000-000000000061', 'c8000000-0000-0000-0000-000000000004', 'day',
   '2026-12-04 09:00+09', '2026-12-04 18:00+09');

-- ── Schema (data-model.md submissions.client_op_id, shifts.updated_at) ──────────────────────
select has_column('public', 'submissions', 'client_op_id', 'submissions has client_op_id');
select col_type_is('public', 'submissions', 'client_op_id', 'uuid', 'submissions.client_op_id is a uuid');
select has_column('public', 'shifts', 'updated_at', 'shifts has updated_at');
select col_not_null('public', 'shifts', 'updated_at', 'shifts.updated_at is not null');
select col_has_default('public', 'shifts', 'updated_at', 'shifts.updated_at has a default');
select ok((select updated_at is not null from public.shifts where id = 'c8000000-0000-0000-0000-000000000061'),
  'a new shift gets an updated_at');

-- One op id names at most one submission (the idempotency key, research R7).
update public.submissions set client_op_id = 'c8000000-0000-0000-0000-0000000000a1'
  where id = 'c8000000-0000-0000-0000-000000000041';
select throws_ok(
  $$ insert into public.submissions (student_id, lesson_id, status, client_op_id)
     values ('c8000000-0000-0000-0000-000000000003', 'c8000000-0000-0000-0000-000000000031', 'draft',
             'c8000000-0000-0000-0000-0000000000a1') $$,
  '23505', null, 'a second submission with the same client_op_id is refused');

-- ── Policies unchanged: Ann can't touch Bob's rows, op id or not ────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub": "c8000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is_empty(
  $$ update public.submissions set body_md = 'mine now', client_op_id = 'c8000000-0000-0000-0000-0000000000a2'
     where id = 'c8000000-0000-0000-0000-000000000041' returning id $$,
  'a student cannot update another student''s submission, even with an op id');
select is_empty(
  $$ update public.shifts set type = 'night', client_op_id = 'c8000000-0000-0000-0000-0000000000a3'
     where id = 'c8000000-0000-0000-0000-000000000061' returning id $$,
  'a student cannot update another student''s shift, even with an op id');

select * from finish();
rollback;
