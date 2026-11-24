-- Spec 007 Appearance (data-model.md › Migration; research R8). Written by hand: schema.prisma is
-- unchanged, because CHECK constraints are SQL-only (docs/data-model.md §7). The database holds
-- only appearance values the app can render. Precondition checked on 2026-11-24 (tasks.md T001):
-- every profile was indigo / inter / 1.00.

-- Profile.theme_id: the 10 colour themes (spec FR-003; src/lib/appearance.ts themeIds).
alter table public.profiles add constraint profiles_theme_id_check check (
  theme_id in ('indigo', 'ocean', 'teal', 'forest', 'sunset', 'rose', 'sakura', 'lavender', 'slate', 'mocha')
);

-- Profile.font_id: the 10 fonts (spec FR-006; src/lib/appearance.ts fontIds).
alter table public.profiles add constraint profiles_font_id_check check (
  font_id in ('inter', 'nunito', 'poppins', 'dm-sans', 'manrope', 'roboto', 'atkinson',
              'merriweather', 'm-plus-rounded', 'zen-maru')
);

-- Profile.font_scale: Small / Default / Large only (spec FR-008; research R7). 0_init declared the
-- 0.85–1.25 range inline, so Postgres named it profiles_font_scale_check; the name is kept.
alter table public.profiles drop constraint profiles_font_scale_check;
alter table public.profiles add constraint profiles_font_scale_check check (
  font_scale in (0.93, 1.00, 1.13)
);
