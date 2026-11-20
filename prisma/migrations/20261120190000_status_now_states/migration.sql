-- Spec 005 FR-006: live status = on_shift / sleeping / free / unknown, with the next change time.
--   on_shift  in a working shift
--   sleeping  in a sleep block after a shift, or outside waking hours
--   free      anything else (quiet hours only hold notifications; they don't change the status)
--   unknown   no shifts entered (spec 005 User Story 4.3), or the caller may not see this student
-- until = the next time the status becomes different, looking 2 days ahead (null if none or unknown).
--
-- status_at(student, at) is the deterministic core (testable with fixed instants);
-- status_now(student) = status_at(student, now()).
-- Notification holding must use next_free_at(), not this status (it treats quiet hours as free).
--
-- SECURITY INVOKER: no RLS bypass is needed. busy_segments() checks the caller itself, and the
-- profiles/shifts lookups below run under the caller's RLS (self or linked admin). Server code
-- (Prisma, cron) connects without a user token, so auth.uid() is null and the guards decide access.

create or replace function public.status_at(p_student uuid, p_at timestamptz)
returns table (state text, until timestamptz)
language sql stable security invoker set search_path = public as $$
  with visible as (
    -- the caller may see this student and the student has entered at least one shift
    select exists (
             select 1 from profiles
              where id = p_student
                and (auth.uid() is null or auth.uid() = p_student or is_admin_of(p_student))
           )
       and exists (select 1 from shifts where student_id = p_student) as ok
  ),
  seg as (
    select b.kind, b.start_at, b.end_at
      from busy_segments(p_student, p_at, p_at + interval '2 days') b
     where b.kind in ('shift', 'sleep', 'night')
  ),
  -- the status can only change at a segment boundary, so evaluate it at "now" and at each boundary
  points as (
    select p_at as t
    union
    select x.t
      from seg cross join lateral (values (seg.start_at), (seg.end_at)) as x(t)
     where x.t > p_at and x.t < p_at + interval '2 days'
  ),
  states as (
    select pt.t,
           case
             when exists (select 1 from seg
                           where seg.kind = 'shift' and seg.start_at <= pt.t and seg.end_at > pt.t)
               then 'on_shift'
             when exists (select 1 from seg
                           where seg.kind in ('sleep', 'night') and seg.start_at <= pt.t and seg.end_at > pt.t)
               then 'sleeping'
             else 'free'
           end as st
      from points pt
  ),
  cur as (
    select st from states where t = p_at
  )
  select case when v.ok then cur.st else 'unknown' end,
         case when v.ok then (select min(s.t) from states s where s.t > p_at and s.st <> cur.st) end
    from visible v, cur;
$$;

create or replace function public.status_now(p_student uuid)
returns table (state text, until timestamptz)
language sql stable security invoker set search_path = public as $$
  select * from status_at(p_student, now());
$$;

-- Only signed-in users (and server connections) may call these; anon may not.
revoke execute on function public.status_at(uuid, timestamptz) from public, anon;
revoke execute on function public.status_now(uuid) from public, anon;
grant execute on function public.status_at(uuid, timestamptz) to authenticated;
grant execute on function public.status_now(uuid) to authenticated;
