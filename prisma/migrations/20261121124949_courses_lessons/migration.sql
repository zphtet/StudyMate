-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "allow_student_notes" BOOLEAN NOT NULL DEFAULT true;



-- ── Added by hand (docs/data-model.md §7 step 3; specs/002-courses-lessons/data-model.md › Migration) ──

-- 1. Field rules (data-model.md: Course.color/description/levelTag, CourseSection.title/position,
--    Lesson.position/assignmentPrompt/unlockRule, LessonResource.name/sizeBytes/url/storagePath).
alter table public.courses
  add constraint courses_color_check
    check (color in ('indigo', 'teal', 'rust', 'berry', 'green', 'slate')),
  add constraint courses_description_check
    check (description is null or char_length(description) <= 1000),
  add constraint courses_level_tag_check
    check (level_tag is null or char_length(level_tag) <= 20);

alter table public.course_sections
  add constraint course_sections_title_check check (char_length(title) between 1 and 80),
  add constraint course_sections_position_check check (position >= 0);

alter table public.lessons
  add constraint lessons_position_check check (position >= 0),
  add constraint lessons_assignment_prompt_check
    check (assignment_prompt is null or char_length(assignment_prompt) <= 2000),
  add constraint lessons_unlock_rule_check check (
    coalesce(unlock_rule ->> 'type', '') in ('none', 'after_previous', 'on_date')
    and (unlock_rule ->> 'type' <> 'on_date'
         or coalesce(unlock_rule ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'));

alter table public.lesson_resources
  add constraint lesson_resources_name_check check (char_length(name) between 1 and 200),
  add constraint lesson_resources_size_check
    check (size_bytes is null or size_bytes between 0 and 10485760),
  add constraint lesson_resources_target_check check (
    (kind = 'link' and url is not null and storage_path is null)
    or (kind <> 'link' and storage_path is not null and url is null));

-- 2. Lesson-level read rule (research.md R2). Owners read everything of theirs; students read
--    Published, non-deleted lessons of courses they can read, and of an Archived course only the
--    lessons they completed. Mirrored by requireLessonReader in src/server/auth/guards.ts.
create or replace function public.can_read_lesson(p_lesson uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from lessons l
    join courses c on c.id = l.course_id
    where l.id = p_lesson
      and (
        c.owner_id = auth.uid()
        or (l.status = 'published'
            and l.deleted_at is null
            and can_read_course(c.id)
            and (c.status <> 'archived'
                 or c.is_personal
                 or exists (select 1 from lesson_progress p
                            where p.lesson_id = l.id
                              and p.student_id = auth.uid()
                              and p.status = 'done')))
      )
  );
$$;

-- Folder n of a Storage object name as a uuid, or null when it isn't one. Policies on
-- storage.objects run for every bucket's rows and Postgres doesn't promise AND order, so the cast
-- must never throw on another bucket's paths.
create or replace function public.uuid_folder(p_name text, p_index int)
returns uuid language sql immutable set search_path = public as $$
  select case
    when (storage.foldername(p_name))[p_index]
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[p_index])::uuid
  end;
$$;

-- 3. Read policies now follow lesson visibility (replaces the 0_init versions on purpose).
drop policy lessons_read on public.lessons;
create policy lessons_read on public.lessons for select using (can_read_lesson(id));

drop policy resources_read on public.lesson_resources;
create policy resources_read on public.lesson_resources for select using (can_read_lesson(lesson_id));

-- lesson-files/<course_id>/<lesson_id>/<uuid>.<ext>
drop policy lesson_files_read on storage.objects;
create policy lesson_files_read on storage.objects for select using (
  bucket_id = 'lesson-files'
  and (owns_course(public.uuid_folder(name, 1)) or can_read_lesson(public.uuid_folder(name, 2))));

drop policy lesson_files_write on storage.objects;
create policy lesson_files_write on storage.objects for insert with check (
  bucket_id = 'lesson-files'
  and owns_course(public.uuid_folder(name, 1))
  and exists (select 1 from public.lessons l
              where l.id = public.uuid_folder(name, 2)
                and l.course_id = public.uuid_folder(name, 1)));

-- 4. Bucket limits (research.md R3): 10 MB, images, PDF and audio only.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
      'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm']
where id = 'lesson-files';

-- 5. "Recently deleted" and the daily purge.
create index courses_deleted on public.courses (owner_id, deleted_at) where deleted_at is not null;
create index lessons_deleted on public.lessons (course_id, deleted_at) where deleted_at is not null;
