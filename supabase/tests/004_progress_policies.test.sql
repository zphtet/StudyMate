-- Spec 004 FR-001–FR-004, FR-007, FR-010, Role access: who can write completion, submissions,
-- comments and focus sessions, and read submission files (research.md R3, R11, R17). Second layer
-- behind the server guards (src/server/auth/guards.ts, same cases in guards.test.ts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Xavier: admin, owns courses 11 (Ann assigned), 12 (nobody assigned) and 13 (only a Draft lesson).
-- Yuki: another admin, owns course 15. Ann: linked to Xavier, active on 11 and 13, owns personal
-- course 16. Bob: linked to Xavier, not assigned. Cai: linked to Yuki only.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c4000000-0000-0000-0000-000000000001', 'x4@example.test', '{"role": "admin", "display_name": "Xavier"}'),
  ('c4000000-0000-0000-0000-000000000002', 'y4@example.test', '{"role": "admin", "display_name": "Yuki"}'),
  ('c4000000-0000-0000-0000-000000000003', 'a4@example.test', '{"role": "student", "display_name": "Ann"}'),
  ('c4000000-0000-0000-0000-000000000004', 'b4@example.test', '{"role": "student", "display_name": "Bob"}'),
  ('c4000000-0000-0000-0000-000000000005', 'c4@example.test', '{"role": "student", "display_name": "Cai"}');

insert into public.student_links (student_id, admin_id, status) values
  ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'active'),
  ('c4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000001', 'active'),
  ('c4000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000002', 'active');

insert into public.courses (id, owner_id, title, status, is_personal) values
  ('c4000000-0000-0000-0000-000000000011', 'c4000000-0000-0000-0000-000000000001', 'Grammar', 'active', false),
  ('c4000000-0000-0000-0000-000000000012', 'c4000000-0000-0000-0000-000000000001', 'Kanji', 'active', false),
  ('c4000000-0000-0000-0000-000000000013', 'c4000000-0000-0000-0000-000000000001', 'Empty', 'active', false),
  ('c4000000-0000-0000-0000-000000000015', 'c4000000-0000-0000-0000-000000000002', 'Yuki''s', 'active', false),
  ('c4000000-0000-0000-0000-000000000016', 'c4000000-0000-0000-0000-000000000003', 'My notes', 'draft', true);

insert into public.course_assignments (course_id, student_id, assigned_by, status) values
  ('c4000000-0000-0000-0000-000000000011', 'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'active'),
  ('c4000000-0000-0000-0000-000000000013', 'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'active');

-- 31, 32, 33 published in 11; 37 published in 12; 38 Draft in 13; 34 published in Yuki's 15; 36 in Ann's 16.
insert into public.lessons (id, course_id, title, status, position) values
  ('c4000000-0000-0000-0000-000000000031', 'c4000000-0000-0000-0000-000000000011', 'Particles', 'published', 0),
  ('c4000000-0000-0000-0000-000000000032', 'c4000000-0000-0000-0000-000000000011', 'Verbs', 'published', 1),
  ('c4000000-0000-0000-0000-000000000033', 'c4000000-0000-0000-0000-000000000011', 'Adjectives', 'published', 2),
  ('c4000000-0000-0000-0000-000000000037', 'c4000000-0000-0000-0000-000000000012', 'Radicals', 'published', 0),
  ('c4000000-0000-0000-0000-000000000038', 'c4000000-0000-0000-0000-000000000013', 'Not yet', 'draft', 0),
  ('c4000000-0000-0000-0000-000000000034', 'c4000000-0000-0000-0000-000000000015', 'Yuki lesson', 'published', 0),
  ('c4000000-0000-0000-0000-000000000036', 'c4000000-0000-0000-0000-000000000016', 'My lesson', 'published', 0);

-- Ann: 41 submitted (lesson 31), 42 draft (lesson 32), 46 draft (personal lesson 36).
-- Bob: 43 submitted (lesson 31).
insert into public.submissions (id, student_id, lesson_id, status, submitted_at) values
  ('c4000000-0000-0000-0000-000000000041', 'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000031', 'submitted', now()),
  ('c4000000-0000-0000-0000-000000000042', 'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000032', 'draft', null),
  ('c4000000-0000-0000-0000-000000000046', 'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000036', 'draft', null),
  ('c4000000-0000-0000-0000-000000000043', 'c4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000031', 'submitted', now());

-- Files: Ann's submitted lesson 31 and her Draft personal lesson 36.
insert into storage.objects (bucket_id, name) values
  ('submissions', 'c4000000-0000-0000-0000-000000000003/c4000000-0000-0000-0000-000000000031/a.webp'),
  ('submissions', 'c4000000-0000-0000-0000-000000000003/c4000000-0000-0000-0000-000000000036/d.webp');

-- ── Schema (data-model.md › Migration) ────────────────────────────────────────────────────
select has_column('public', 'study_sessions', 'planned_minutes', 'study_sessions has planned_minutes');
select has_index('public', 'lesson_progress', 'lesson_progress_student_completed', 'lesson_progress (student_id, completed_at) index');
select has_index('public', 'comments', 'comments_thread', 'comments thread index');
select has_index('public', 'study_sessions', 'study_sessions_student_started', 'study_sessions (student_id, started_at) index');

select throws_ok(
  $$ insert into public.study_sessions (student_id, lesson_id, started_at, planned_minutes)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000031', now(), 20) $$,
  '23514', null, 'StudySession.planned_minutes must be 15 or 25');
select throws_ok(
  $$ insert into public.study_sessions (student_id, lesson_id, started_at, ended_at, planned_minutes)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000031',
             now() - interval '1 hour', now(), 15) $$,
  '23514', null, 'StudySession.ended_at can''t be later than started_at + planned_minutes');
select lives_ok(
  $$ insert into public.study_sessions (student_id, lesson_id, started_at, ended_at, planned_minutes)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000031',
             now() - interval '1 hour', now() - interval '45 minutes', 15) $$,
  'a session ending exactly at its planned length is allowed');
select lives_ok(
  $$ insert into public.study_sessions (student_id, lesson_id, started_at, planned_minutes)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000031', now(), 25) $$,
  'a running session is allowed');
select throws_ok(
  $$ insert into public.study_sessions (student_id, lesson_id, started_at, planned_minutes)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000032', now(), 15) $$,
  '23505', null, 'a student has at most one running session');

select is((select file_size_limit from storage.buckets where id = 'submissions')::bigint, 2097152::bigint,
  'submission files are limited to 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'submissions'),
  array['image/webp', 'image/jpeg'],
  'submission files are WebP or JPEG');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename in ('submissions', 'comments', 'lesson_progress')), 3,
  'submissions, comments and lesson_progress are published to Realtime');
select ok((select percent is null from public.course_progress
           where student_id = 'c4000000-0000-0000-0000-000000000003'
             and course_id = 'c4000000-0000-0000-0000-000000000013')
          is not false,
  'a course with no published lessons has no percent (spec Edge Cases)');

set local role authenticated;

-- ── Student Ann ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c4000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status, completed_at, completed_by)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000031', 'done', now(),
             'c4000000-0000-0000-0000-000000000003') $$,
  'a student completes a lesson they can read');
select throws_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status, completed_at, completed_by)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000032', 'done', now(),
             'c4000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a student can''t record someone else as completed_by');
select throws_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000034', 'in_progress') $$,
  '42501', null, 'a student can''t write progress on a lesson they can''t read');
select results_eq(
  $$ with u as (update public.lesson_progress set status = 'not_started', completed_at = null, completed_by = null
                where student_id = 'c4000000-0000-0000-0000-000000000003'
                  and lesson_id = 'c4000000-0000-0000-0000-000000000031' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'a student undoes their own completion');
select results_eq(
  $$ with d as (delete from public.lesson_progress
                where student_id = 'c4000000-0000-0000-0000-000000000003' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'progress rows can''t be deleted');

select lives_ok(
  $$ insert into public.submissions (student_id, lesson_id, status)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000033', 'draft') $$,
  'a student starts a draft on a lesson they can read');
select throws_ok(
  $$ insert into public.submissions (student_id, lesson_id, status)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000037', 'draft') $$,
  '42501', null, 'a student can''t start a submission on a lesson they can''t read');
select throws_ok(
  $$ insert into public.submissions (student_id, lesson_id, status)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000032', 'reviewed') $$,
  '42501', null, 'a student can''t create a reviewed submission');
select results_eq(
  $$ with u as (update public.submissions set body_md = 'hello', status = 'submitted', submitted_at = now()
                where id = 'c4000000-0000-0000-0000-000000000042' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'a student submits their draft');
select results_eq(
  $$ with u as (update public.submissions set body_md = 'changed'
                where id = 'c4000000-0000-0000-0000-000000000041' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a Submitted submission is read-only to the student');
select throws_ok(
  $$ update public.submissions set status = 'reviewed'
     where id = 'c4000000-0000-0000-0000-000000000046' $$,
  '42501', null, 'a student can''t mark their own work Reviewed');

select lives_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000003', 'lesson',
             'c4000000-0000-0000-0000-000000000031', 'Question about は') $$,
  'a student posts in their Notes thread');
select lives_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000003', 'lesson',
             'c4000000-0000-0000-0000-000000000036', 'Note to self') $$,
  'a student posts in Notes on their own personal course (can_read_lesson)');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000003', 'lesson',
             'c4000000-0000-0000-0000-000000000037', 'Not mine') $$,
  '42501', null, 'a student can''t post on a lesson of a course they aren''t assigned');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000003', 'submission',
             'c4000000-0000-0000-0000-000000000041', 'Reply') $$,
  '42501', null, 'a student can''t write review comments');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'lesson',
             'c4000000-0000-0000-0000-000000000031', 'Pretending') $$,
  '42501', null, 'Comment.author_id must be the caller');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000004', 'lesson',
             'c4000000-0000-0000-0000-000000000031', 'In Bob''s thread') $$,
  '42501', null, 'a student can''t post in another student''s thread');

select is((select count(*)::int from storage.objects where bucket_id = 'submissions'
           and name like 'c4000000-0000-0000-0000-000000000003/%'), 2,
  'a student reads their own submission files');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('submissions', 'c4000000-0000-0000-0000-000000000003/c4000000-0000-0000-0000-000000000031/c.webp') $$,
  'a student uploads into their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('submissions', 'c4000000-0000-0000-0000-000000000004/c4000000-0000-0000-0000-000000000031/x.webp') $$,
  '42501', null, 'a student can''t upload into another student''s folder');

-- ── Admin Xavier (linked to Ann and Bob, owns 11–13) ─────────────────────────────────────
set local request.jwt.claims to '{"sub": "c4000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status, completed_at, completed_by)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000032', 'done', now(),
             'c4000000-0000-0000-0000-000000000001') $$,
  'the Admin marks a lesson done for their assigned student');
select throws_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status, completed_at, completed_by)
     values ('c4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000031', 'done', now(),
             'c4000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'the Admin can''t mark done for a linked student without an active assignment');
select throws_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status, completed_at, completed_by)
     values ('c4000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000031', 'done', now(),
             'c4000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'the Admin can''t mark done for a student who isn''t linked to them');
select throws_ok(
  $$ update public.lesson_progress set completed_by = 'c4000000-0000-0000-0000-000000000003'
     where student_id = 'c4000000-0000-0000-0000-000000000003'
       and lesson_id = 'c4000000-0000-0000-0000-000000000032' $$,
  '42501', null, 'the Admin can''t record the student as completed_by');
select results_eq(
  $$ with u as (update public.lesson_progress set status = 'not_started', completed_at = null, completed_by = null
                where student_id = 'c4000000-0000-0000-0000-000000000003'
                  and lesson_id = 'c4000000-0000-0000-0000-000000000032' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'the Admin reopens the lesson');

select is((select count(*)::int from public.submissions
           where student_id = 'c4000000-0000-0000-0000-000000000003'), 2,
  'the Admin sees Ann''s non-Draft submissions only');
select results_eq(
  $$ with u as (update public.submissions set status = 'needs_redo', reviewed_at = now()
                where id = 'c4000000-0000-0000-0000-000000000041' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'the Admin asks for a redo');
select results_eq(
  $$ with u as (update public.submissions set status = 'reviewed', reviewed_at = now()
                where id = 'c4000000-0000-0000-0000-000000000041' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'the Admin changes the review to Reviewed (spec FR-004)');
select throws_ok(
  $$ update public.submissions set status = 'submitted'
     where id = 'c4000000-0000-0000-0000-000000000041' $$,
  '42501', null, 'the Admin can''t set a submission back to Submitted');
select results_eq(
  $$ with u as (update public.submissions set status = 'reviewed', reviewed_at = now()
                where id = 'c4000000-0000-0000-0000-000000000046' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'the Admin can''t touch a Draft');

select lives_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'lesson',
             'c4000000-0000-0000-0000-000000000031', 'Answer') $$,
  'the Admin posts in the student''s Notes thread');
select lives_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'submission',
             'c4000000-0000-0000-0000-000000000041', 'Check です') $$,
  'the Admin writes a review comment');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'lesson',
             'c4000000-0000-0000-0000-000000000036', 'In her own course') $$,
  '42501', null, 'the Admin can''t post on the student''s personal course');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'submission',
             'c4000000-0000-0000-0000-000000000043', 'Wrong thread') $$,
  '42501', null, 'a review comment must target a submission of that thread''s student');
select throws_ok(
  $$ insert into public.comments (author_id, student_id, target_type, target_id, body)
     values ('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'submission',
             'c4000000-0000-0000-0000-000000000046', 'A draft') $$,
  '42501', null, 'a review comment can''t target a Draft');

select is((select count(*)::int from storage.objects where bucket_id = 'submissions'
           and name like 'c4000000-0000-0000-0000-000000000003/%'), 2,
  'the Admin reads files of non-Draft submissions only');

-- ── Admin Yuki (not linked to Ann) ────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c4000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is((select count(*)::int from public.lesson_progress
           where student_id = 'c4000000-0000-0000-0000-000000000003'), 0,
  'another admin sees none of Ann''s progress');
select throws_ok(
  $$ insert into public.lesson_progress (student_id, lesson_id, status, completed_by)
     values ('c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000034', 'done',
             'c4000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'another admin can''t write Ann''s progress');
select is((select count(*)::int from public.submissions
           where student_id = 'c4000000-0000-0000-0000-000000000003'), 0,
  'another admin sees none of Ann''s submissions');
select is((select count(*)::int from storage.objects where bucket_id = 'submissions'
           and name like 'c4000000-0000-0000-0000-000000000003/%'), 0,
  'another admin reads none of Ann''s files');

-- ── Student Bob ───────────────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c4000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is((select count(*)::int from public.comments
           where student_id = 'c4000000-0000-0000-0000-000000000003'), 0,
  'another student never sees Ann''s threads');

select * from finish();
rollback;
