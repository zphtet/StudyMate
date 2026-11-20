-- Spec 001 FR-011 (research R3, data-model.md AuthEmailLimit) and FR-015 (research R7).
-- auth_email_limits is server-only: RLS on, no policies, no privileges for browser roles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'auth_email_limits', 'auth_email_limits exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.auth_email_limits'::regclass), true,
  'RLS is enabled');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'auth_email_limits'), 0,
  'no policies: only the server (Prisma) reaches it');

select table_privs_are('public', 'auth_email_limits', 'anon', array[]::text[],
  'anon has no privileges on it');

select table_privs_are('public', 'auth_email_limits', 'authenticated', array[]::text[],
  'authenticated has no privileges on it');

select col_is_pk('public', 'auth_email_limits', array['email', 'purpose'],
  'primary key is (email, purpose)');

select throws_ok(
  $$ insert into public.auth_email_limits (email, purpose) values ('a@example.test', 'login') $$,
  '23514', null,
  'purpose must be signup or recovery');

select throws_ok(
  $$ insert into public.auth_email_limits (email, purpose, sends_in_window) values ('a@example.test', 'signup', -1) $$,
  '23514', null,
  'sends_in_window cannot be negative');

select throws_ok(
  $$ insert into public.auth_email_limits (email, purpose, failed_attempts) values ('a@example.test', 'signup', -1) $$,
  '23514', null,
  'failed_attempts cannot be negative');

select ok(
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_links'),
  'student_links is published to Realtime (live link updates)');

select * from finish();
rollback;
