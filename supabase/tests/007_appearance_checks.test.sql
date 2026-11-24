-- Spec 007 FR-001, FR-003, FR-006, FR-008: the database holds only appearance values the app can
-- render (research.md R8; data-model.md › Migration: Profile.theme_id, Profile.font_id,
-- Profile.font_scale). Appearance is per person: nobody can change another profile's look.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────
-- May: student. Zin: admin. Not linked; linking doesn't matter for one's own profile.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c7000000-0000-0000-0000-000000000001', 'may7@example.test', '{"role": "student", "display_name": "May"}'),
  ('c7000000-0000-0000-0000-000000000002', 'zin7@example.test', '{"role": "admin", "display_name": "Zin"}');

-- ── Defaults (FR-010) ─────────────────────────────────────────────────────────────────────
select ok((select theme_id = 'indigo' and font_id = 'inter' and font_scale = 1.00 and color_mode = 'system'
             from public.profiles where id = 'c7000000-0000-0000-0000-000000000001'),
          'a new profile is Auto, Indigo, Inter, Default size');

-- ── Theme ids (data-model.md Profile.theme_id) ────────────────────────────────────────────
select lives_ok(
  format($$update public.profiles set theme_id = %L where id = 'c7000000-0000-0000-0000-000000000001'$$, t),
  format('theme %s is accepted', t))
from unnest(array['indigo', 'ocean', 'teal', 'forest', 'sunset', 'rose', 'sakura', 'lavender', 'slate', 'mocha']) as t;

select throws_ok(
  $$update public.profiles set theme_id = 'pink' where id = 'c7000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'an unknown theme is refused');

-- ── Font ids (data-model.md Profile.font_id) ──────────────────────────────────────────────
select lives_ok(
  format($$update public.profiles set font_id = %L where id = 'c7000000-0000-0000-0000-000000000001'$$, f),
  format('font %s is accepted', f))
from unnest(array['inter', 'nunito', 'poppins', 'dm-sans', 'manrope', 'roboto', 'atkinson',
                  'merriweather', 'm-plus-rounded', 'zen-maru']) as f;

select throws_ok(
  $$update public.profiles set font_id = 'comic-sans' where id = 'c7000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'an unknown font is refused');

-- ── Text size (data-model.md Profile.font_scale) ──────────────────────────────────────────
select lives_ok(
  format($$update public.profiles set font_scale = %s where id = 'c7000000-0000-0000-0000-000000000001'$$, s),
  format('font_scale %s is accepted', s))
from unnest(array['0.93', '1.00', '1.13']) as s;

select throws_ok(
  $$update public.profiles set font_scale = 0.90 where id = 'c7000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'font_scale 0.90 (inside the old range) is refused');
select throws_ok(
  $$update public.profiles set font_scale = 1.25 where id = 'c7000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'font_scale 1.25 is refused');

-- ── Only one's own profile (existing profiles_self_update policy) ────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub": "c7000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- RLS hides Zin's row from May's update: it runs and changes nothing.
select lives_ok(
  $$update public.profiles set theme_id = 'sakura' where id = 'c7000000-0000-0000-0000-000000000002'$$,
  'May''s update of Zin''s theme runs');
select lives_ok(
  $$update public.profiles set theme_id = 'sakura', font_id = 'nunito', font_scale = 1.13
    where id = 'c7000000-0000-0000-0000-000000000001'$$,
  'May''s update of her own look runs');

reset role;
select is((select theme_id from public.profiles where id = 'c7000000-0000-0000-0000-000000000002'),
          'indigo', 'May cannot change Zin''s theme: still Indigo');
select ok((select theme_id = 'sakura' and font_id = 'nunito' and font_scale = 1.13
             from public.profiles where id = 'c7000000-0000-0000-0000-000000000001'),
          'May can change her own theme, font and size');

select * from finish();
rollback;
