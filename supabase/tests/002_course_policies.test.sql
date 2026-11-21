-- Spec 002 FR-005, FR-008, SC-003: who can read courses, lessons, resources and lesson files
-- (can_read_lesson, research.md R2), plus the CHECK constraints from data-model.md › Migration.
-- Second layer behind the server guards (src/server/auth/guards.ts, same cases in guards.test.ts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- Xavier: admin with courses. Yuki: another admin. Ann: student linked to Xavier and assigned to
-- his active, draft, archived and deleted courses. Ben: student linked to Xavier, not assigned.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c2000000-0000-0000-0000-000000000001', 'x2@example.test', '{"role": "admin", "display_name": "Xavier"}'),
  ('c2000000-0000-0000-0000-000000000002', 'y2@example.test', '{"role": "admin", "display_name": "Yuki"}'),
  ('c2000000-0000-0000-0000-000000000003', 'a2@example.test', '{"role": "student", "display_name": "Ann"}'),
  ('c2000000-0000-0000-0000-000000000004', 'b2@example.test', '{"role": "student", "display_name": "Ben"}');

insert into public.student_links (student_id, admin_id, status) values
  ('c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'active'),
  ('c2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'active');

-- Courses: 11 active, 12 draft, 13 archived, 14 active but deleted (Xavier); 15 active (Yuki).
insert into public.courses (id, owner_id, title, status, deleted_at) values
  ('c2000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000001', 'Active', 'active', null),
  ('c2000000-0000-0000-0000-000000000012', 'c2000000-0000-0000-0000-000000000001', 'Draft', 'draft', null),
  ('c2000000-0000-0000-0000-000000000013', 'c2000000-0000-0000-0000-000000000001', 'Archived', 'archived', null),
  ('c2000000-0000-0000-0000-000000000014', 'c2000000-0000-0000-0000-000000000001', 'Deleted', 'active', now()),
  ('c2000000-0000-0000-0000-000000000015', 'c2000000-0000-0000-0000-000000000002', 'Yuki''s', 'active', null);

insert into public.course_assignments (course_id, student_id, assigned_by)
select c, 'c2000000-0000-0000-0000-000000000003'::uuid, 'c2000000-0000-0000-0000-000000000001'::uuid
from unnest(array['c2000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000012',
                  'c2000000-0000-0000-0000-000000000013', 'c2000000-0000-0000-0000-000000000014']::uuid[]) as c;

insert into public.course_sections (id, course_id, title, position) values
  ('c2000000-0000-0000-0000-000000000021', 'c2000000-0000-0000-0000-000000000011', 'Week 1', 0);

-- Lessons: 31 published, 32 draft, 33 published+deleted (course 11); 34 published (draft course 12);
-- 35 published+done by Ann, 36 published not done (archived course 13); 37 published (deleted course 14).
insert into public.lessons (id, course_id, section_id, title, status, position, deleted_at) values
  ('c2000000-0000-0000-0000-000000000031', 'c2000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000021', 'Published', 'published', 0, null),
  ('c2000000-0000-0000-0000-000000000032', 'c2000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000021', 'Draft', 'draft', 1, null),
  ('c2000000-0000-0000-0000-000000000033', 'c2000000-0000-0000-0000-000000000011', null, 'Deleted', 'published', 0, now()),
  ('c2000000-0000-0000-0000-000000000034', 'c2000000-0000-0000-0000-000000000012', null, 'In draft course', 'published', 0, null),
  ('c2000000-0000-0000-0000-000000000035', 'c2000000-0000-0000-0000-000000000013', null, 'Archived done', 'published', 0, null),
  ('c2000000-0000-0000-0000-000000000036', 'c2000000-0000-0000-0000-000000000013', null, 'Archived open', 'published', 1, null),
  ('c2000000-0000-0000-0000-000000000037', 'c2000000-0000-0000-0000-000000000014', null, 'In deleted course', 'published', 0, null);

insert into public.lesson_progress (student_id, lesson_id, status, completed_at) values
  ('c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000035', 'done', now());

insert into public.lesson_resources (id, lesson_id, kind, name, storage_path, size_bytes) values
  ('c2000000-0000-0000-0000-000000000041', 'c2000000-0000-0000-0000-000000000031', 'file', 'pub.pdf',
   'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000031/a.pdf', 10),
  ('c2000000-0000-0000-0000-000000000042', 'c2000000-0000-0000-0000-000000000032', 'file', 'draft.pdf',
   'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000032/b.pdf', 10),
  ('c2000000-0000-0000-0000-000000000043', 'c2000000-0000-0000-0000-000000000035', 'file', 'done.pdf',
   'c2000000-0000-0000-0000-000000000013/c2000000-0000-0000-0000-000000000035/c.pdf', 10),
  ('c2000000-0000-0000-0000-000000000044', 'c2000000-0000-0000-0000-000000000036', 'file', 'open.pdf',
   'c2000000-0000-0000-0000-000000000013/c2000000-0000-0000-0000-000000000036/d.pdf', 10);

insert into storage.objects (bucket_id, name) values
  ('lesson-files', 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000031/a.pdf'),
  ('lesson-files', 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000032/b.pdf'),
  ('lesson-files', 'c2000000-0000-0000-0000-000000000013/c2000000-0000-0000-0000-000000000035/c.pdf'),
  ('lesson-files', 'c2000000-0000-0000-0000-000000000013/c2000000-0000-0000-0000-000000000036/d.pdf');

select has_function('public', 'can_read_lesson', array['uuid'], 'can_read_lesson(uuid) exists');

set local role authenticated;

-- ── Student Ann (assigned) ────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c2000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000031'), 1,
  'a student reads a published lesson of an assigned active course');
select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000032'), 0,
  'a student cannot read a draft lesson');
select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000033'), 0,
  'a student cannot read a deleted lesson');
select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000034'), 0,
  'a student cannot read lessons of a draft course');
select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000035'), 1,
  'a student reads a completed lesson of an archived course');
select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000036'), 0,
  'a student cannot read an uncompleted lesson of an archived course');
select is((select count(*)::int from public.lessons where id = 'c2000000-0000-0000-0000-000000000037'), 0,
  'a student cannot read lessons of a deleted course');
select is((select count(*)::int from public.course_sections where id = 'c2000000-0000-0000-0000-000000000021'), 1,
  'a student reads sections of an assigned active course');
select is((select count(*)::int from public.lesson_resources where id = 'c2000000-0000-0000-0000-000000000041'), 1,
  'a student reads resources of a published lesson');
select is((select count(*)::int from public.lesson_resources where id = 'c2000000-0000-0000-0000-000000000042'), 0,
  'a student cannot read resources of a draft lesson');
select is((select count(*)::int from public.lesson_resources where id = 'c2000000-0000-0000-0000-000000000043'), 1,
  'a student reads resources of a completed archived lesson');
select is((select count(*)::int from public.lesson_resources where id = 'c2000000-0000-0000-0000-000000000044'), 0,
  'a student cannot read resources of an uncompleted archived lesson');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-files'
  and name = 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000031/a.pdf'), 1,
  'a student reads the file of a published lesson');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-files'
  and name = 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000032/b.pdf'), 0,
  'a student cannot read the file of a draft lesson in the same course');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-files'
  and name = 'c2000000-0000-0000-0000-000000000013/c2000000-0000-0000-0000-000000000035/c.pdf'), 1,
  'a student reads the file of a completed archived lesson');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-files'
  and name = 'c2000000-0000-0000-0000-000000000013/c2000000-0000-0000-0000-000000000036/d.pdf'), 0,
  'a student cannot read the file of an uncompleted archived lesson');
select throws_ok(
  $$ insert into public.lessons (course_id, title, position)
     values ('c2000000-0000-0000-0000-000000000011', 'Sneaky', 9) $$,
  '42501', null,
  'a student cannot add a lesson to an admin course');

-- ── Student Ben (linked, not assigned) ────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c2000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is((select count(*)::int from public.lessons where course_id = 'c2000000-0000-0000-0000-000000000011'), 0,
  'an unassigned student reads no lessons of the course');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-files'), 0,
  'an unassigned student reads no lesson files');

-- ── Admin Xavier (owner) ──────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c2000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select count(*)::int from public.lessons where course_id = 'c2000000-0000-0000-0000-000000000011'), 3,
  'the owner reads every lesson of their course, draft and deleted included');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-files'
  and name = 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000032/b.pdf'), 1,
  'the owner reads files of draft lessons');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('lesson-files', 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000031/new.pdf') $$,
  'the owner uploads into a lesson folder of their course');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('lesson-files', 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000034/x.pdf') $$,
  '42501', null,
  'an upload whose lesson folder belongs to another course is refused');
select lives_ok(
  $$ update public.lessons set title = 'Renamed' where id = 'c2000000-0000-0000-0000-000000000032' $$,
  'the owner edits their lesson');

-- ── Admin Yuki (not the owner) ────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "c2000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is((select count(*)::int from public.lessons where course_id = 'c2000000-0000-0000-0000-000000000011'), 0,
  'another admin reads no lessons of the course');
-- RLS filters the update to zero rows; the title is checked after `reset role` below.
update public.lessons set title = 'Hijack' where id = 'c2000000-0000-0000-0000-000000000031';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('lesson-files', 'c2000000-0000-0000-0000-000000000011/c2000000-0000-0000-0000-000000000031/y.pdf') $$,
  '42501', null,
  'another admin cannot upload into the course folder');

-- ── CHECK constraints and defaults (data-model.md › Migration) ────────────────────────────
reset role;

select isnt((select title from public.lessons where id = 'c2000000-0000-0000-0000-000000000031'), 'Hijack',
  'another admin cannot edit the lesson');
select throws_ok(
  $$ insert into public.courses (owner_id, title, color) values ('c2000000-0000-0000-0000-000000000001', 'T', 'purple') $$,
  '23514', null, 'Course.color must be one of the six keys');
select throws_ok(
  $$ insert into public.courses (owner_id, title, description) values ('c2000000-0000-0000-0000-000000000001', 'T', repeat('x', 1001)) $$,
  '23514', null, 'Course.description is at most 1000 characters');
select throws_ok(
  $$ insert into public.courses (owner_id, title, level_tag) values ('c2000000-0000-0000-0000-000000000001', 'T', repeat('x', 21)) $$,
  '23514', null, 'Course.levelTag is at most 20 characters');
select throws_ok(
  $$ insert into public.course_sections (course_id, title, position) values ('c2000000-0000-0000-0000-000000000011', '', 1) $$,
  '23514', null, 'CourseSection.title is not empty');
select throws_ok(
  $$ insert into public.course_sections (course_id, title, position) values ('c2000000-0000-0000-0000-000000000011', 'W', -1) $$,
  '23514', null, 'CourseSection.position is not negative');
select throws_ok(
  $$ insert into public.lessons (course_id, title, position) values ('c2000000-0000-0000-0000-000000000011', 'L', -1) $$,
  '23514', null, 'Lesson.position is not negative');
select throws_ok(
  $$ insert into public.lessons (course_id, title, position, assignment_prompt)
     values ('c2000000-0000-0000-0000-000000000011', 'L', 5, repeat('x', 2001)) $$,
  '23514', null, 'Lesson.assignmentPrompt is at most 2000 characters');
select throws_ok(
  $$ insert into public.lessons (course_id, title, position, unlock_rule)
     values ('c2000000-0000-0000-0000-000000000011', 'L', 5, '{"type": "weird"}') $$,
  '23514', null, 'Lesson.unlockRule type must be none, after_previous or on_date');
select throws_ok(
  $$ insert into public.lessons (course_id, title, position, unlock_rule)
     values ('c2000000-0000-0000-0000-000000000011', 'L', 5, '{"type": "on_date"}') $$,
  '23514', null, 'Lesson.unlockRule on_date needs a date');
select lives_ok(
  $$ insert into public.lessons (course_id, title, position, unlock_rule)
     values ('c2000000-0000-0000-0000-000000000011', 'L', 5, '{"type": "on_date", "date": "2027-01-15"}') $$,
  'Lesson.unlockRule on_date with a YYYY-MM-DD date is accepted');
select throws_ok(
  $$ insert into public.lesson_resources (lesson_id, kind, name, url) values ('c2000000-0000-0000-0000-000000000031', 'link', '', 'https://example.com') $$,
  '23514', null, 'LessonResource.name is not empty');
select throws_ok(
  $$ insert into public.lesson_resources (lesson_id, kind, name, storage_path, size_bytes)
     values ('c2000000-0000-0000-0000-000000000031', 'file', 'big.pdf', 'p/q/r.pdf', 10485761) $$,
  '23514', null, 'LessonResource.sizeBytes is at most 10 MB');
select throws_ok(
  $$ insert into public.lesson_resources (lesson_id, kind, name, url, storage_path)
     values ('c2000000-0000-0000-0000-000000000031', 'link', 'Both', 'https://example.com', 'p/q/r.pdf') $$,
  '23514', null, 'a link has a url and no storage path');
select throws_ok(
  $$ insert into public.lesson_resources (lesson_id, kind, name) values ('c2000000-0000-0000-0000-000000000031', 'file', 'Nothing') $$,
  '23514', null, 'a stored file needs a storage path');
select is((select allow_student_notes from public.courses where id = 'c2000000-0000-0000-0000-000000000011'), true,
  'Course.allowStudentNotes defaults to true');
select is((select file_size_limit from storage.buckets where id = 'lesson-files')::bigint, 10485760::bigint,
  'the lesson-files bucket limits files to 10 MB');

select * from finish();
rollback;
