-- Spec 005 research R2: an Off day is stored as the whole local day [00:00, next 00:00), which is 25 h
-- on a daylight-saving fall-back day. 0_init's unnamed CHECK (end_at - start_at <= 24 hours) refused
-- that row. FR-001's 24 h limit is for working shifts, so it is replaced on purpose by a named CHECK
-- that keeps 24 h for working shifts and allows Off up to 25 h. SQL only: no Prisma diff.
-- Found while checking the 005 e2e fixtures (tasks.md T013).

alter table public.shifts drop constraint shifts_check1;

alter table public.shifts
  add constraint shifts_max_length check (
    end_at - start_at <= case when type = 'off' then interval '25 hours' else interval '24 hours' end
  );
