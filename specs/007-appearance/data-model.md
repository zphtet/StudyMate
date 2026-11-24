# Data Model: Appearance — Themes, Fonts, Text Size

No new tables or columns. The appearance fields exist on `profiles` since `0_init` (docs/data-model.md §3); 007 adds CHECK constraints so the database only holds values the app can render (research R8). Themes and fonts are fixed lists in code. The device's copy of the look lives in one cookie (R1).

## Entities

### Profile (`profiles`) — appearance fields

| Field | Type | Rule |
| --- | --- | --- |
| `color_mode` | text | `light` / `dark` / `system` (existing CHECK). UI label "Auto" = `system` |
| `theme_id` | text, default `indigo` | **new CHECK** `profiles_theme_id_check`: one of `indigo`, `ocean`, `teal`, `forest`, `sunset`, `rose`, `sakura`, `lavender`, `slate`, `mocha` |
| `font_id` | text, default `inter` | **new CHECK** `profiles_font_id_check`: one of `inter`, `nunito`, `poppins`, `dm-sans`, `manrope`, `roboto`, `atkinson`, `merriweather`, `m-plus-rounded`, `zen-maru` |
| `font_scale` | numeric(3,2), default 1.00 | **CHECK replaced**: `profiles_font_scale_check` `font_scale in (0.93, 1.00, 1.13)` (was `between 0.85 and 1.25`). API name `textSize`: `small` = 0.93, `default` = 1.00, `large` = 1.13 |
| `locale` | text | unchanged (001) |

Written only by `saveAppearance` (`where: { id: me.id }`) and read by `GET /api/me` and the `/s` and `/a` layouts. Last write wins.

### Theme (code: `src/lib/appearance.ts`)

| Field | Rule |
| --- | --- |
| `id` | the CHECK list above; `indigo` is the default and the `:root` palette |
| `swatch` | the light `--primary` hex, for the swatch on Appearance and Me |
| name | translated, `appearance.themes.<id>` |
| palettes | CSS only: `[data-theme='<id>']` and `.dark[data-theme='<id>']` blocks in `globals.css` setting `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--ring`, `--chart-1` (R4). Indigo uses `:root` / `.dark` |

### Font (code: `src/lib/appearance.ts` + `src/app/fonts.ts`)

| Field | Rule |
| --- | --- |
| `id` | the CHECK list above; `inter` is the default |
| `name` | shown as is, never translated: Inter, Nunito, Poppins, DM Sans, Manrope, Roboto, Atkinson Hyperlegible, Merriweather, M PLUS Rounded 1c, Zen Maru Gothic |
| family | `next/font/google` instance with `variable: '--font-<id>'`; CSS `[data-font='<id>'] { --font-active: var(--font-<id>); }` (R6) |
| fallbacks | always Noto Sans JP, then Noto Sans Myanmar, then system (constitution VI) |

### Device state (not stored on the server)

| Where | Value | Written by | Read by |
| --- | --- | --- | --- |
| cookie `appearance` (path `/`, 1 year, `SameSite=Lax`, not `HttpOnly`) | `<mode>.<theme>.<font>.<size>`, e.g. `system.indigo.inter.default` | `setPreferenceCookies` on sign-in and code verification; `saveAppearance`; `AppearanceSync` when the profile differs | the pre-paint script |
| `<html data-theme>` | theme id; absent for Indigo | pre-paint script, the view, `AppearanceSync` | CSS |
| `<html data-font>` | font id | same | CSS |
| `<html style="--font-scale">` | `0.93` / `1` / `1.13` | same | CSS (R7) |
| `localStorage.theme` | `light` / `dark` / `system` | pre-paint script, `next-themes` | `next-themes` |

Parsing is per part: an unknown or missing part becomes its default, so a tampered cookie can only pick a valid look. Signing out keeps the cookie (US3 scenario 2).

## Lifecycle: one change

1. The user taps a theme, font, size or mode on Appearance.
2. The device applies it at once: `<html>` attribute or `setTheme`, and the `['me']` cache.
3. `saveAppearance` saves the profile and returns `Set-Cookie: appearance=…`.
4. Error → the device restores the saved values from the cache it kept, and the error toast shows (FR-014).
5. Another signed-in device: on its next open, its layout passes the profile's look to `AppearanceSync`, which sees the cookie differs, rewrites it and applies it once (clarification Q4).

## Migration

`prisma/migrations/<UTC timestamp>_appearance_checks/migration.sql`, written by hand (no `schema.prisma` change, docs/data-model.md §7):

- Precondition (a task step, on `DIRECT_URL`): `select count(*) from profiles where theme_id not in (…) or font_id not in (…) or font_scale not in (0.93, 1.00, 1.13)` is 0.
- `alter table profiles add constraint profiles_theme_id_check check (theme_id in (…10…))`;
- `alter table profiles add constraint profiles_font_id_check check (font_id in (…10…))`;
- replace the `font_scale` range CHECK: `0_init` declares it inline, so Postgres named it `profiles_font_scale_check`; drop that and add a constraint with the same name, `check (font_scale in (0.93, 1.00, 1.13))`.
- No RLS change: profiles' existing update policy already limits a user to their own row.

pgTAP (`supabase/tests/007_appearance_checks.test.sql`): each CHECK refuses a bad value and accepts every listed one; an authenticated user's update of another profile's `theme_id` changes nothing.

## Guards

| Path | Guard | Scope |
| --- | --- | --- |
| `saveAppearance` | `requireUser()` | `where: { id: me.id }` |
| `GET /api/me` (extended) | `requireUser()` (existing) | own row |
| `/s` and `/a` layouts (`AppearanceSync`) | `requirePageUser()` (existing) | own row |
