-- Spec 003 FR-001–FR-004, FR-013, SC-003: who can read and write course assignments and lesson
-- deadlines (research.md R12, R15), effective_due, and the default-reminder partial unique index.
-- Second layer behind the server guards (src/server/auth/guards.ts, same cases in guards.test.ts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Xavier: admin who owns courses 11 and 12. Yuki: another admin who owns course 15.
-- Ann: linked to Xavier, active on 11 (with a course deadline) and, to isolate the ownership rule,
--      on Yuki's course 15. Ben: linked to Xavier, `removed` from 11 (deadline kept).
-- Cai: linked to Yuki only, but active on 11 (isolates the link rule). Dee: linked to Xavier, unassigned.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c3000000-0000-0000-0000-000000000001', 'x3@example.test', '{"role": "admin", "display_name": "Xavier"}'),
  ('c3000000-0000-0000-0000-000000000002', 'y3@example.test', '{"role": "admin", "display_name": "Yuki"}'),
  ('c3000000-0000-0000-0000-000000000003', 'a3@example.test', '{"role": "student", "display_name": "Ann"}'),
  ('c3000000-0000-0000-0000-000000000004', 'b3@example.test', '{"role": "student", "display_name": "Ben"}'),
  ('c3000000-0000-0000-0000-000000000005', 'c3@example.test', '{"role": "student", "display_name": "Cai"}'),
  ('c3000000-0000-0000-0000-000000000006', 'd3@example.test', '{"role": "student", "display_name": "Dee"}');

insert into public.student_links (student_id, admin_id, status) values
  ('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', 'active'),
  ('c3000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000001', 'active'),
  ('c3000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000002', 'active'),
  ('c3000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000001', 'active');

insert into public.courses (id, owner_id, title, status) values
  ('c3000000-0000-0000-0000-000000000011', 'c3000000-0000-0000-0000-000000000001', 'Grammar', 'active'),
  ('c3000000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000001', 'Kanji', 'active'),
  ('c3000000-0000-0000-0000-000000000015', 'c3000000-0000-0000-0000-000000000002', 'Yuki''s', 'active');

insert into public.course_assignments (course_id, student_id, assigned_by, due_at, status) values
  ('c3000000-0000-0000-0000-000000000011', 'c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', '2026-12-31 14:59:00+00', 'active'),
  ('c3000000-0000-0000-0000-000000000015', 'c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000002', null, 'active'),
  ('c3000000-0000-0000-0000-000000000011', 'c3000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000001', '2026-12-31 14:59:00+00', 'removed'),
  ('c3000000-0000-0000-0000-000000000011', 'c3000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000001', null, 'active');

-- Lessons: 31 and 35 published, 32 draft, 33 published but deleted (course 11); 34 published (Yuki's 15).
insert into public.lessons (id, course_id, title, status, position, deleted_at) values
  ('c3000000-0000-0000-0000-000000000031', 'c3000000-0000-0000-0000-000000000011', 'Particles', 'published', 0, null),
  ('c3000000-0000-0000-0000-000000000032', 'c3000000-0000-0000-0000-000000000011', 'Draft', 'draft', 1, null),
  ('c3000000-0000-0000-0000-000000000033', 'c3000000-0000-0000-0000-000000000011', 'Deleted', 'published', 2, now()),
  ('c3000000-0000-0000-0000-000000000035', 'c3000000-0000-0000-0000-000000000011', 'Verbs', 'published', 3, null),
  ('c3000000-0000-0000-0000-000000000034', 'c3000000-0000-0000-0000-000000000015', 'Yuki lesson', 'published', 0, null);

-- Ben's deadline on the deleted lesson: hidden while the lesson is deleted, but kept (spec Edge Cases).
insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by) values
  ('c3000000-0000-0000-0000-000000000033', 'c3000000-0000-0000-0000-000000000004', '2026-12-01 10:00:00+00', 'c3000000-0000-0000-0000-000000000001');

select has_index('public', 'lesson_deadlines', 'lesson_deadlines_student_due',
  'lesson_deadlines has the (student_id, due_at) index');

set local role authenticated;

-- ── Admin Xavier (owner) ──────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c3000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select count(*)::int from public.course_assignments where course_id = 'c3000000-0000-0000-0000-000000000011'), 3,
  'the owner reads every assignment of their course');
select throws_ok(
  $$ insert into public.course_assignments (course_id, student_id, assigned_by)
     values ('c3000000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'the owner cannot record someone else as assigned_by');
select throws_ok(
  $$ insert into public.course_assignments (course_id, student_id, assigned_by)
     values ('c3000000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'the owner cannot assign a student who is not linked to them');
select lives_ok(
  $$ insert into public.course_assignments (course_id, student_id, assigned_by)
     values ('c3000000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000001') $$,
  'the owner assigns their course to a linked student');
select throws_ok(
  $$ update public.course_assignments set status = 'paused'
     where course_id = 'c3000000-0000-0000-0000-000000000011' and student_id = 'c3000000-0000-0000-0000-000000000003' $$,
  '23514', null,
  'CourseAssignment.status must be active or removed');

select lives_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000031', 'c3000000-0000-0000-0000-000000000003', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000001') $$,
  'the owner sets a deadline on their Published lesson for an actively assigned, linked student');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000034', 'c3000000-0000-0000-0000-000000000003', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'no deadline on another admin''s lesson, even for my own student');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000032', 'c3000000-0000-0000-0000-000000000003', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'no deadline on a Draft lesson');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000033', 'c3000000-0000-0000-0000-000000000003', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'no deadline on a deleted lesson');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000035', 'c3000000-0000-0000-0000-000000000004', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'no deadline for a student whose assignment was removed');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000035', 'c3000000-0000-0000-0000-000000000005', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'no deadline for a student who is not linked to me, even when assigned');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000035', 'c3000000-0000-0000-0000-000000000003', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'set_by must be the caller');
select lives_ok(
  $$ update public.lesson_deadlines set due_at = '2026-11-26 12:00:00+00'
     where lesson_id = 'c3000000-0000-0000-0000-000000000031' and student_id = 'c3000000-0000-0000-0000-000000000003' $$,
  'the owner moves the deadline');
select is((select count(*)::int from public.lesson_deadlines where student_id = 'c3000000-0000-0000-0000-000000000003'), 1,
  'the admin reads their student''s lesson deadlines');
-- RLS hides the row from delete while its lesson is deleted; checked after `reset role` below.
delete from public.lesson_deadlines where lesson_id = 'c3000000-0000-0000-0000-000000000033';

-- ── Admin Yuki (not the owner) ────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c3000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is((select count(*)::int from public.course_assignments where course_id = 'c3000000-0000-0000-0000-000000000011'), 0,
  'another admin reads no assignments of the course');
select is((select count(*)::int from public.lesson_deadlines where student_id = 'c3000000-0000-0000-0000-000000000003'), 0,
  'another admin reads no deadlines of a student who is not theirs');
select throws_ok(
  $$ insert into public.course_assignments (course_id, student_id, assigned_by)
     values ('c3000000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'another admin cannot assign a course they do not own, even to their own student');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000035', 'c3000000-0000-0000-0000-000000000005', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'another admin cannot set deadlines on lessons they do not own, even for their own student');

-- ── Student Ann ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c3000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is((select count(*)::int from public.course_assignments where student_id = 'c3000000-0000-0000-0000-000000000003'), 2,
  'a student reads their own assignments');
select is((select count(*)::int from public.course_assignments where student_id <> 'c3000000-0000-0000-0000-000000000003'), 0,
  'a student reads no other student''s assignments');
select is((select count(*)::int from public.lesson_deadlines where student_id = 'c3000000-0000-0000-0000-000000000003'), 1,
  'a student reads their own lesson deadlines');
select throws_ok(
  $$ insert into public.course_assignments (course_id, student_id, assigned_by)
     values ('c3000000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'a student cannot assign a course to themself');
select throws_ok(
  $$ insert into public.lesson_deadlines (lesson_id, student_id, due_at, set_by)
     values ('c3000000-0000-0000-0000-000000000035', 'c3000000-0000-0000-0000-000000000003', '2026-11-25 12:00:00+00', 'c3000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'a student cannot set their own lesson deadline');

-- ── Student Ben ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c3000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is((select count(*)::int from public.lesson_deadlines where student_id = 'c3000000-0000-0000-0000-000000000003'), 0,
  'a student reads no other student''s lesson deadlines');
select is((select count(*)::int from public.lesson_deadlines where student_id = 'c3000000-0000-0000-0000-000000000004'), 1,
  'a student still reads their deadline on a hidden lesson (the app filters it out)');

-- ── effective_due, kept rows and the default-reminder index ───────────────────────────────
reset role;

select is((select count(*)::int from public.lesson_deadlines where lesson_id = 'c3000000-0000-0000-0000-000000000033'), 1,
  'a deadline on a deleted lesson is kept (the admin could not delete it while hidden)');
select is(public.effective_due('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000031'),
  '2026-11-26 12:00:00+00'::timestamptz,
  'effective_due: the lesson deadline wins over the course deadline');
select is(public.effective_due('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000035'),
  '2026-12-31 14:59:00+00'::timestamptz,
  'effective_due: the course deadline when the lesson has none');
select is(public.effective_due('c3000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000035'),
  null::timestamptz,
  'effective_due: null after the assignment is removed');
select is(public.effective_due('c3000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000035'),
  null::timestamptz,
  'effective_due: null without an assignment');

select lives_ok(
  $$ insert into public.notification_rules (admin_id, student_id, trigger, config, message)
     values ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000003', 'daily',
             '{"preset": "default", "time": "20:00", "days": [1, 2, 3, 4, 5, 6, 7]}', 'Time to study') $$,
  'the default daily rule is inserted');
select throws_ok(
  $$ insert into public.notification_rules (admin_id, student_id, trigger, config, message)
     values ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000003', 'daily',
             '{"preset": "default", "time": "20:00", "days": [1, 2, 3, 4, 5, 6, 7]}', 'Time to study') $$,
  '23505', null,
  'a second default rule with the same admin, student and trigger is refused');
select lives_ok(
  $$ insert into public.notification_rules (admin_id, student_id, trigger, config, message)
     values ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000003', 'daily',
             '{"time": "07:00", "days": [1, 2, 3, 4, 5]}', 'Morning review'),
            ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000003', 'daily',
             '{"time": "12:00", "days": [6, 7]}', 'Weekend review') $$,
  'rules that are not the default preset are not limited');
select lives_ok(
  $$ insert into public.notification_rules (admin_id, student_id, trigger, config, message)
     values ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000003', 'due_soon',
             '{"preset": "default", "offsets_h": [24, 2]}', 'Due soon') $$,
  'the default set allows one rule per trigger');

select * from finish();
rollback;
