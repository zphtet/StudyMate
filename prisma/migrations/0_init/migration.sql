-- StudyMate — initial schema (DRAFT v1, 2026-11-20) — Prisma baseline migration 0_init
-- Matches prisma/schema.prisma + docs/data-model.md. Contains what Prisma cannot express (RLS, functions,
-- triggers, checks, exclusion constraint, partial indexes). Apply with: pnpm prisma migrate deploy

create extension if not exists btree_gist;

-- ───────────────────────────── Enums ─────────────────────────────
create type public.user_role        as enum ('student', 'admin');
create type public.link_status      as enum ('pending', 'active', 'declined', 'removed');
create type public.course_status    as enum ('draft', 'active', 'archived');
create type public.lesson_status_t  as enum ('draft', 'published');
create type public.progress_status  as enum ('not_started', 'in_progress', 'done');
create type public.submission_status as enum ('draft', 'submitted', 'reviewed', 'needs_redo');
create type public.shift_type       as enum ('day', 'evening', 'night', 'off', 'custom');
create type public.rule_trigger     as enum ('daily', 'after_shift', 'due_soon', 'overdue', 'streak_risk', 'inactive', 'weekly_summary');
create type public.message_mode     as enum ('now', 'fixed', 'next_free');
create type public.message_status   as enum ('scheduled', 'sending', 'sent', 'cancelled');

-- ───────────────────────────── Profiles & linking (spec 001, 007) ─────────────────────────────
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  role                 public.user_role not null,
  display_name         text not null check (char_length(display_name) between 1 and 60),
  avatar_url           text,
  timezone             text not null default 'UTC',
  locale               text not null default 'en' check (locale in ('en', 'my', 'ja')),
  color_mode           text not null default 'system' check (color_mode in ('light', 'dark', 'system')),
  theme_id             text not null default 'indigo',
  font_id              text not null default 'inter',
  font_scale           numeric(3,2) not null default 1.00 check (font_scale between 0.85 and 1.25),
  weekly_goal_days     smallint not null default 5 check (weekly_goal_days between 1 and 7),
  sleep_minutes        smallint not null default 480,          -- sleep block after night shift
  after_shift_buffer   smallint not null default 30,           -- commute before sleep, minutes
  waking_start         time not null default '08:00',
  waking_end           time not null default '23:00',
  quiet_start          time,
  quiet_end            time,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.admin_invites (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index admin_invites_one_active on public.admin_invites(admin_id) where active;

create table public.student_links (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  status      public.link_status not null default 'pending',
  created_at  timestamptz not null default now(),
  responded_at timestamptz
);
-- one active admin per student (spec 001 FR-006, pending clarification)
create unique index student_links_one_active on public.student_links(student_id) where status = 'active';
create index student_links_admin on public.student_links(admin_id, status);

-- ───────────────────────────── Courses & lessons (spec 002) ─────────────────────────────
create table public.courses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  is_personal     boolean not null default false,              -- created by a student
  title           text not null check (char_length(title) between 1 and 120),
  description     text,
  icon            text not null default '文' check (char_length(icon) <= 2),
  color           text not null default 'indigo',
  level_tag       text,
  target_date     date,
  unlock_in_order boolean not null default true,
  status          public.course_status not null default 'draft',
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index courses_owner on public.courses(owner_id) where deleted_at is null;

create table public.course_sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  title      text not null,
  position   integer not null
);
create index course_sections_course on public.course_sections(course_id, position);

create table public.lessons (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  section_id         uuid references public.course_sections(id) on delete set null,
  title              text not null check (char_length(title) between 1 and 160),
  content_md         text not null default '' check (octet_length(content_md) <= 204800),
  est_minutes        smallint not null default 15 check (est_minutes between 1 and 600),
  assignment_prompt  text,
  require_submission boolean not null default false,
  unlock_rule        jsonb not null default '{"type":"after_previous"}',  -- none | after_previous | on_date
  status             public.lesson_status_t not null default 'draft',
  position           integer not null,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index lessons_course on public.lessons(course_id, position) where deleted_at is null;

create table public.lesson_resources (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  kind          text not null check (kind in ('file', 'link', 'audio', 'image')),
  name          text not null,
  url           text,
  storage_path  text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

-- ───────────────────────────── Assignments & deadlines (spec 003) ─────────────────────────────
create table public.course_assignments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_by  uuid not null references public.profiles(id),
  due_at       timestamptz,
  status       text not null default 'active' check (status in ('active', 'removed')),
  created_at   timestamptz not null default now(),
  unique (course_id, student_id)
);
create index course_assignments_student on public.course_assignments(student_id) where status = 'active';

create table public.lesson_deadlines (
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  due_at      timestamptz not null,
  set_by      uuid not null references public.profiles(id),
  primary key (lesson_id, student_id)
);

-- ───────────────────────────── Progress & submissions (spec 004) ─────────────────────────────
create table public.lesson_progress (
  student_id    uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  status        public.progress_status not null default 'not_started',
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id),
  minutes_spent integer not null default 0,
  client_op_id  uuid unique,                                   -- offline idempotency key
  updated_at    timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  body_md      text not null default '',
  attachments  jsonb not null default '[]',                    -- [{path, name, size}]
  status       public.submission_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_at  timestamptz,
  updated_at   timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,  -- whose thread
  target_type  text not null check (target_type in ('lesson', 'submission')),
  target_id    uuid not null,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create table public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  lesson_id   uuid references public.lessons(id) on delete set null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  client_op_id uuid unique,
  check (ended_at is null or ended_at > started_at)
);

-- ───────────────────────────── Shifts (spec 005) ─────────────────────────────
create table public.shift_patterns (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  sequence    text not null check (sequence ~ '^[DENOC]{1,28}$'),  -- D day, E evening, N night, O off, C custom
  start_date  date not null,
  presets     jsonb not null default '{"D":["09:00","18:00"],"E":["14:00","23:00"],"N":["22:00","07:00"]}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  type           public.shift_type not null,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  sleep_minutes  smallint not null default 0,                  -- 0 = no sleep block after
  pattern_id     uuid references public.shift_patterns(id) on delete set null,
  overridden     boolean not null default false,
  client_op_id   uuid unique,
  created_at     timestamptz not null default now(),
  check (end_at > start_at),
  check (end_at - start_at <= interval '24 hours'),
  -- no overlapping working shifts for the same student ('off' days are stored without overlap checks)
  exclude using gist (student_id with =, tstzrange(start_at, end_at) with &&) where (type <> 'off')
);
create index shifts_student_time on public.shifts(student_id, start_at);

-- ───────────────────────────── Notifications (spec 006) ─────────────────────────────
create table public.notification_rules (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid references public.profiles(id) on delete cascade,   -- null = all linked students
  trigger     public.rule_trigger not null,
  config      jsonb not null default '{}',     -- e.g. {"time":"20:00","days":[1,2,3,4,5]} / {"offsets_h":[24,2]}
  message     text not null,
  channels    text[] not null default '{push,inapp}',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.scheduled_messages (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  lesson_id   uuid references public.lessons(id) on delete set null,
  mode        public.message_mode not null,
  send_at     timestamptz,                     -- null when mode = next_free
  urgent      boolean not null default false,
  status      public.message_status not null default 'scheduled',
  created_at  timestamptz not null default now()
);

create table public.scheduled_message_recipients (
  message_id    uuid not null references public.scheduled_messages(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  deliver_at    timestamptz not null,
  delivered_at  timestamptz,
  read_at       timestamptz,
  primary key (message_id, student_id)
);
create index smr_due on public.scheduled_message_recipients(deliver_at) where delivered_at is null;

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  device_label  text,
  last_seen_at  timestamptz not null default now()
);

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  source_type     text not null,               -- rule | message | system
  source_id       uuid,
  occurrence_key  text not null,               -- e.g. '2026-11-20' or deadline id
  title           text not null,
  body            text not null,
  url             text,
  sent_at         timestamptz not null default now(),
  read_at         timestamptz,
  unique (source_type, source_id, user_id, occurrence_key)
);
create index notifications_user on public.notifications(user_id, sent_at desc);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid not null references public.profiles(id),
  action     text not null,
  target     jsonb not null,
  at         timestamptz not null default now()
);

-- ───────────────────────────── Helper functions ─────────────────────────────
create or replace function public.current_role_is(p_role public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = p_role);
$$;

create or replace function public.is_admin_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from student_links
                 where admin_id = auth.uid() and student_id = p_student and status = 'active');
$$;

create or replace function public.my_admin_id()
returns uuid language sql stable security definer set search_path = public as $$
  select admin_id from student_links where student_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function public.can_read_course(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    where c.id = p_course and c.deleted_at is null
      and (
        c.owner_id = auth.uid()
        or (c.is_personal and is_admin_of(c.owner_id))
        or (c.status in ('active', 'archived') and exists (
              select 1 from course_assignments a
              where a.course_id = c.id and a.student_id = auth.uid() and a.status = 'active'))
      )
  );
$$;

create or replace function public.owns_course(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from courses where id = p_course and owner_id = auth.uid());
$$;

-- ───────────────────────────── New user trigger (spec 001) ─────────────────────────────
create or replace function public.random_invite_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'student');
begin
  insert into profiles (id, role, display_name, timezone, locale)
  values (new.id, v_role,
          coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'timezone', 'UTC'),
          coalesce(new.raw_user_meta_data->>'locale', 'en'));
  if v_role = 'admin' then
    loop
      begin
        insert into admin_invites (admin_id, code) values (new.id, random_invite_code());
        exit;
      exception when unique_violation then
        -- code collision, try again
      end;
    end loop;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Role may never change after sign-up
create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role <> old.role then raise exception 'role cannot be changed'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_role_locked before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ───────────────────────────── Join flow RPCs (spec 001) ─────────────────────────────
create or replace function public.preview_invite(p_code text)
returns table (admin_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from admin_invites i join profiles p on p.id = i.admin_id
  where i.code = upper(p_code) and i.active;
$$;

create or replace function public.request_join(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_link uuid;
begin
  if not current_role_is('student') then raise exception 'only students can join'; end if;
  if exists (select 1 from student_links where student_id = auth.uid() and status = 'active') then
    raise exception 'already linked to an admin';
  end if;
  select admin_id into v_admin from admin_invites where code = upper(p_code) and active;
  if v_admin is null then raise exception 'code not found'; end if;
  insert into student_links (student_id, admin_id) values (auth.uid(), v_admin) returning id into v_link;
  return v_link;
end $$;

create or replace function public.respond_join(p_link uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update student_links
     set status = case when p_approve then 'active'::link_status else 'declined'::link_status end,
         responded_at = now()
   where id = p_link and admin_id = auth.uid() and status = 'pending';
  if not found then raise exception 'request not found'; end if;
end $$;

-- ───────────────────────────── Deadlines & progress views (spec 003, 004) ─────────────────────────────
create or replace function public.effective_due(p_student uuid, p_lesson uuid)
returns timestamptz language sql stable as $$
  select coalesce(
    (select d.due_at from lesson_deadlines d where d.lesson_id = p_lesson and d.student_id = p_student),
    (select a.due_at from course_assignments a join lessons l on l.course_id = a.course_id
      where l.id = p_lesson and a.student_id = p_student and a.status = 'active'));
$$;

create or replace view public.course_progress with (security_invoker = true) as
select a.student_id,
       a.course_id,
       count(l.id) filter (where l.status = 'published' and l.deleted_at is null)                         as published_lessons,
       count(p.lesson_id) filter (where p.status = 'done' and l.status = 'published' and l.deleted_at is null) as done_lessons,
       case when count(l.id) filter (where l.status = 'published' and l.deleted_at is null) = 0 then null
            else round(100.0 * count(p.lesson_id) filter (where p.status = 'done' and l.status = 'published' and l.deleted_at is null)
                       / count(l.id) filter (where l.status = 'published' and l.deleted_at is null)) end as percent
from course_assignments a
join lessons l on l.course_id = a.course_id
left join lesson_progress p on p.lesson_id = l.id and p.student_id = a.student_id
where a.status = 'active'
group by a.student_id, a.course_id;

-- ───────────────────────────── Availability (spec 005) ─────────────────────────────
-- Busy segments: shifts, sleep blocks after shifts, quiet hours, and outside waking hours.
-- Free time = everything not covered by a busy segment (computed in lib/availability.ts for display).
create or replace function public.busy_segments(p_student uuid, p_from timestamptz, p_to timestamptz)
returns table (kind text, start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  -- caller must be the student, their linked admin, or a server connection without a user token (Prisma, cron: auth.uid() is null)
  with prof as (select * from profiles
                 where id = p_student
                   and (auth.uid() is null or auth.uid() = p_student or is_admin_of(p_student))),
  days as (
    select d::date as day
    from prof, generate_series(((p_from at time zone prof.timezone)::date - 1),
                               ((p_to at time zone prof.timezone)::date + 1), interval '1 day') d
  )
  -- working shifts
  select 'shift', s.start_at, s.end_at
    from shifts s
   where s.student_id = p_student and s.type <> 'off'
     and exists (select 1 from prof)
     and tstzrange(s.start_at, s.end_at) && tstzrange(p_from, p_to)
  union all
  -- sleep after shifts that request it
  select 'sleep', s.end_at + make_interval(mins => prof.after_shift_buffer),
         s.end_at + make_interval(mins => prof.after_shift_buffer + s.sleep_minutes)
    from shifts s, prof
   where s.student_id = p_student and s.sleep_minutes > 0
     and tstzrange(s.end_at, s.end_at + make_interval(mins => prof.after_shift_buffer + s.sleep_minutes)) && tstzrange(p_from, p_to)
  union all
  -- outside waking hours (local night)
  select 'night', ((d.day + prof.waking_end) at time zone prof.timezone),
         (((d.day + 1) + prof.waking_start) at time zone prof.timezone)
    from days d, prof
  union all
  -- quiet hours (may cross midnight)
  select 'quiet', ((d.day + prof.quiet_start) at time zone prof.timezone),
         (((d.day + case when prof.quiet_end <= prof.quiet_start then 1 else 0 end) + prof.quiet_end) at time zone prof.timezone)
    from days d, prof
   where prof.quiet_start is not null and prof.quiet_end is not null;
$$;

create or replace function public.next_free_at(p_student uuid, p_after timestamptz default now())
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare t timestamptz := p_after; v_end timestamptz; i int := 0;
begin
  loop
    select max(b.end_at) into v_end
      from busy_segments(p_student, t - interval '1 day', t + interval '2 days') b
     where b.start_at <= t and b.end_at > t;
    if v_end is null then return t; end if;
    t := v_end; i := i + 1;
    if i > 50 then return t; end if;
  end loop;
end $$;

create or replace function public.status_now(p_student uuid)
returns table (state text, until timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce((select b.kind from busy_segments(p_student, now() - interval '1 day', now() + interval '1 day') b
                    where b.start_at <= now() and b.end_at > now()
                    order by case b.kind when 'shift' then 1 when 'sleep' then 2 when 'quiet' then 3 else 4 end
                    limit 1), 'free'),
         next_free_at(p_student, now());
$$;

-- Only the student themself, or their linked admin, may call availability functions
revoke execute on function public.busy_segments(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.next_free_at(uuid, timestamptz) from public, anon;
revoke execute on function public.status_now(uuid) from public, anon;
grant execute on function public.busy_segments(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.next_free_at(uuid, timestamptz) to authenticated;
grant execute on function public.status_now(uuid) to authenticated;
-- busy_segments returns no rows unless the caller is the student, their linked admin, or a server connection (Prisma — guard in app code first).

-- ───────────────────────────── Row-Level Security ─────────────────────────────
alter table public.profiles                     enable row level security;
alter table public.admin_invites                enable row level security;
alter table public.student_links                enable row level security;
alter table public.courses                      enable row level security;
alter table public.course_sections              enable row level security;
alter table public.lessons                      enable row level security;
alter table public.lesson_resources             enable row level security;
alter table public.course_assignments           enable row level security;
alter table public.lesson_deadlines             enable row level security;
alter table public.lesson_progress              enable row level security;
alter table public.submissions                  enable row level security;
alter table public.comments                     enable row level security;
alter table public.study_sessions               enable row level security;
alter table public.shift_patterns               enable row level security;
alter table public.shifts                       enable row level security;
alter table public.notification_rules           enable row level security;
alter table public.scheduled_messages           enable row level security;
alter table public.scheduled_message_recipients enable row level security;
alter table public.push_subscriptions           enable row level security;
alter table public.notifications                enable row level security;
alter table public.audit_log                    enable row level security;

-- profiles
create policy profiles_self_read   on public.profiles for select using (id = auth.uid());
create policy profiles_admin_read  on public.profiles for select using (is_admin_of(id));
create policy profiles_student_reads_admin on public.profiles for select using (id = my_admin_id());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- admin_invites: owner only (students use preview_invite / request_join)
create policy invites_owner on public.admin_invites for all using (admin_id = auth.uid()) with check (admin_id = auth.uid());

-- student_links
create policy links_read   on public.student_links for select using (student_id = auth.uid() or admin_id = auth.uid());
create policy links_leave  on public.student_links for update using (student_id = auth.uid() or admin_id = auth.uid())
  with check (status = 'removed');

-- courses
create policy courses_read  on public.courses for select using (can_read_course(id));
create policy courses_write on public.courses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- sections & lessons (students see only published, non-deleted lessons)
create policy sections_read  on public.course_sections for select using (can_read_course(course_id));
create policy sections_write on public.course_sections for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy lessons_read   on public.lessons for select using (
  owns_course(course_id) or (status = 'published' and deleted_at is null and can_read_course(course_id)));
create policy lessons_write  on public.lessons for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy resources_read on public.lesson_resources for select using (
  exists (select 1 from lessons l where l.id = lesson_id and (owns_course(l.course_id) or (l.status = 'published' and can_read_course(l.course_id)))));
create policy resources_write on public.lesson_resources for all using (
  exists (select 1 from lessons l where l.id = lesson_id and owns_course(l.course_id)))
  with check (exists (select 1 from lessons l where l.id = lesson_id and owns_course(l.course_id)));

-- assignments & deadlines: admin writes for own courses + linked students; student reads own
create policy assign_read on public.course_assignments for select using (student_id = auth.uid() or owns_course(course_id));
create policy assign_write on public.course_assignments for all using (owns_course(course_id) and is_admin_of(student_id))
  with check (owns_course(course_id) and is_admin_of(student_id) and assigned_by = auth.uid());
create policy deadlines_read on public.lesson_deadlines for select using (student_id = auth.uid() or is_admin_of(student_id));
create policy deadlines_write on public.lesson_deadlines for all using (is_admin_of(student_id)) with check (is_admin_of(student_id) and set_by = auth.uid());

-- progress, submissions, sessions: student owns; linked admin reads and may update progress/review
create policy progress_student on public.lesson_progress for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy progress_admin_read on public.lesson_progress for select using (is_admin_of(student_id));
create policy progress_admin_write on public.lesson_progress for update using (is_admin_of(student_id)) with check (is_admin_of(student_id));
create policy subs_student on public.submissions for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy subs_admin_read on public.submissions for select using (is_admin_of(student_id) and status <> 'draft');
create policy subs_admin_review on public.submissions for update using (is_admin_of(student_id)) with check (is_admin_of(student_id));
create policy sessions_student on public.study_sessions for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy sessions_admin_read on public.study_sessions for select using (is_admin_of(student_id));
create policy comments_read on public.comments for select using (student_id = auth.uid() or is_admin_of(student_id));
create policy comments_write on public.comments for insert with check (author_id = auth.uid() and (student_id = auth.uid() or is_admin_of(student_id)));

-- shifts: student owns, linked admin reads
create policy patterns_student on public.shift_patterns for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy patterns_admin_read on public.shift_patterns for select using (is_admin_of(student_id));
create policy shifts_student on public.shifts for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy shifts_admin_read on public.shifts for select using (is_admin_of(student_id));

-- notifications
create policy rules_admin on public.notification_rules for all using (admin_id = auth.uid())
  with check (admin_id = auth.uid() and (student_id is null or is_admin_of(student_id)));
create policy rules_student_read on public.notification_rules for select using (student_id = auth.uid());
create policy msgs_admin on public.scheduled_messages for all using (admin_id = auth.uid()) with check (admin_id = auth.uid());
create policy msg_recipients_admin on public.scheduled_message_recipients for all using (
  exists (select 1 from scheduled_messages m where m.id = message_id and m.admin_id = auth.uid()))
  with check (exists (select 1 from scheduled_messages m where m.id = message_id and m.admin_id = auth.uid()) and is_admin_of(student_id));
create policy msg_recipients_student on public.scheduled_message_recipients for select using (student_id = auth.uid());
create policy push_self on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_self_read on public.notifications for select using (user_id = auth.uid());
create policy notif_self_mark_read on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: admins read their own actions; inserts happen in SECURITY DEFINER functions / service role
create policy audit_read on public.audit_log for select using (actor_id = auth.uid());

-- ───────────────────────────── Storage buckets (run once) ─────────────────────────────
insert into storage.buckets (id, name, public) values ('lesson-files', 'lesson-files', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('submissions', 'submissions', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;

-- lesson-files/<course_id>/...
create policy lesson_files_read on storage.objects for select using (
  bucket_id = 'lesson-files' and can_read_course(((storage.foldername(name))[1])::uuid));
create policy lesson_files_write on storage.objects for insert with check (
  bucket_id = 'lesson-files' and owns_course(((storage.foldername(name))[1])::uuid));
create policy lesson_files_delete on storage.objects for delete using (
  bucket_id = 'lesson-files' and owns_course(((storage.foldername(name))[1])::uuid));
-- submissions/<student_id>/...
create policy submission_files_rw on storage.objects for all using (
  bucket_id = 'submissions' and ((storage.foldername(name))[1])::uuid = auth.uid())
  with check (bucket_id = 'submissions' and ((storage.foldername(name))[1])::uuid = auth.uid());
create policy submission_files_admin_read on storage.objects for select using (
  bucket_id = 'submissions' and is_admin_of(((storage.foldername(name))[1])::uuid));
-- avatars/<user_id>/...
create policy avatars_write on storage.objects for all using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid())
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid());

-- ───────────────────────────── JWT role claim hook (enable in Dashboard → Auth → Hooks) ─────────────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare v_role text; v_claims jsonb;
begin
  select role::text into v_role from public.profiles where id = (event->>'user_id')::uuid;
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  v_claims := jsonb_set(v_claims, '{user_role}', coalesce(to_jsonb(v_role), 'null'::jsonb));
  return jsonb_set(event, '{claims}', v_claims);
end $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.profiles to supabase_auth_admin;
create policy profiles_auth_admin_read on public.profiles as permissive for select to supabase_auth_admin using (true);

-- ───────────────────────────── Scheduler (spec 006) ─────────────────────────────
-- Run after deploying the app to Vercel and storing CRON_SECRET in Vault:
-- select cron.schedule('dispatch-notifications', '*/5 * * * *', $$
--   select net.http_post(
--     url := 'https://<your-domain>/api/cron/dispatch',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
--     body := '{}'::jsonb);
-- $$);
