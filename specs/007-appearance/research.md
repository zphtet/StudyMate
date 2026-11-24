# Research: Appearance — Themes, Fonts, Text Size

Phase 0 decisions for [plan.md](plan.md). Each one records what was chosen, why, and what was rejected. The spec was clarified on 2026-11-24 (4 answers); nothing is left as NEEDS CLARIFICATION.

## What exists already

- **Profile columns** (`0_init`): `color_mode` (CHECK light / dark / system), `theme_id` (default `indigo`, no CHECK), `font_id` (default `inter`, no CHECK), `font_scale` (numeric(3,2), default 1.00, CHECK 0.85–1.25), `locale` (CHECK en / my / ja).
- **Mode** (001, pulled forward): `next-themes` with `attribute="class"`, `defaultTheme="system"`, storing the choice in `localStorage.theme`; `setColorMode` saves it on the profile; `ThemeSync` in the `/s` and `/a` layouts applies the profile's mode when it differs from the device's.
- **Language** (001): the Me buttons call `setLocale`, which saves `profiles.locale` and the `locale` cookie; sign-in, sign-up and code verification mirror `locale` and `tz` into cookies (`setPreferenceCookies`). `<html lang>` is set by a tiny pre-paint script in the root layout, because reading cookies there would make every page request-bound under Cache Components (`cacheComponents: true`).
- **Tokens** (`globals.css`): `:root` and `.dark` hold the Indigo palette plus every neutral, status, shift, course, tint and chart token. Heat shades (`--heat-1..4`) and the availability bar (`--avail-shift`) are mixed from `--primary`, so they follow any theme. `src/app/theme-contrast.test.ts` checks 37 pairs per mode for Indigo.
- **Fonts**: Inter (preloaded), Noto Sans JP and Noto Sans Myanmar (not preloaded) via `next/font/google`, as CSS variables on `<html>`; `--font-sans` = Inter → Noto JP → Noto Myanmar → system.
- **Screens**: `/s/me/appearance` and `/a/me/appearance` render `AppearanceView` (Mode plus a "coming soon" note). Me shows "Indigo · Inter · {mode}" with the theme and font hard-coded in the message.
- **All 10 fonts** exist in `next/font/google` (Next 16.4.6). Variable: Inter, Nunito, DM Sans, Manrope, Roboto, Merriweather. Static: Poppins, Atkinson Hyperlegible (400, 700), M PLUS Rounded 1c, Zen Maru Gothic.

## R1. One `appearance` cookie and a pre-paint script, not server-rendered attributes

- **Decision**: the device keeps its look in one cookie, `appearance=<mode>.<theme>.<font>.<size>` (e.g. `dark.sakura.nunito.large`). A small inline script in the root layout's `<head>` reads it before the body is parsed and sets, on `<html>`:
  - `data-theme="<theme>"` (omitted for Indigo, the `:root` default);
  - `data-font="<font>"`;
  - `style="--font-scale: <0.93 | 1 | 1.13>"`;
  - and writes `<mode>` into `localStorage.theme`, so `next-themes`' own script (which runs later, in `<body>`) applies the right class (R2).

  An unknown or missing value falls back to its default, part by part. The server writes the cookie wherever it already writes `locale`/`tz` after loading a profile (sign-in, code verification) and on every appearance save (R9); the client writes it when the account's look changed elsewhere (R3). Signing out leaves it, so sign-in and sign-up show the device's last look (US3 scenario 2).
- **Rationale**: same mechanism as 001's `lang` script, for the same reason: reading cookies in the root layout would make every document request-bound under Cache Components. The script runs before first paint and offline (008), and the cookie (unlike `localStorage`) can be set by the server in the sign-in response, so a new device shows the account's look from the first screen after sign-in (US3 scenario 3). Sign-in and code verification move on with `router.replace`, a client-side navigation that doesn't re-run the script, so both forms apply the new cookie themselves before navigating: `applyAppearance(document, parseAppearanceCookie(document.cookie))` and `setTheme(mode)` (the cookie isn't `HttpOnly`).
- **Alternatives**: server-rendered `data-theme` from cookies (technical-spec §11's original idea; breaks Cache Components); `localStorage` only (the server can't set it at sign-in); four cookies (four parses, four writes, no benefit).

## R2. Mode stays in `next-themes`; the cookie seeds it

- **Decision**: keep `next-themes` for mode (system tracking, `.dark` class, no flash). The pre-paint script copies the cookie's mode into `localStorage.theme` before `next-themes` reads it. Auto keeps following the device live (US4 scenario 1).
- **Rationale**: no change to 001's behaviour or tests; the one gap (a brand-new device) is closed by the cookie the server sets at sign-in.
- **Alternatives**: replacing `next-themes` with our own class toggling (re-implements system tracking and its race fixes).

## R3. Changes made on another device: one switch on the next open

- **Decision**: `ThemeSync` becomes `AppearanceSync({ appearance })`, rendered by the `/s` and `/a` layouts with the profile's mode, theme, font and size. When they differ from the device's cookie, it rewrites the cookie, sets the `<html>` attributes and calls `setTheme(mode)` once. That switch may be visible on that open (clarification Q4); later opens are right from the first frame.
- **Rationale**: the profile is the source of truth; the cookie is the device's cache of it. No polling or Realtime (spec Assumptions: next open is enough).
- **Alternatives**: Realtime on `profiles` (constant connection for a rare change); comparing on every navigation (the layouts already render per request, so this is the same thing).

## R4. Ten themes as accent-only token blocks

- **Decision**: `:root` and `.dark` stay as they are (Indigo + every neutral and status token). Each other theme adds two blocks after them:

  ```css
  [data-theme='ocean'] { --primary: …; --primary-foreground: …; --accent: …; --accent-foreground: …; --ring: …; --chart-1: …; }
  .dark[data-theme='ocean'] { /* same six tokens */ }
  ```

  Only these six tokens change (clarification Q2). `--heat-1..4` and `--avail-shift` follow `--primary` by themselves. Neutral (`--background`, `--card`, `--border`, `--muted*`, `--foreground`), status (`--destructive*`, `--success*`, `--warning*`), shift, course and tint tokens are never overridden (FR-004). `[data-theme]` and `:root` have the same specificity, so the theme blocks come later in the file; `.dark[data-theme]` outranks `.dark`.

  Starting palettes (Tailwind scales; light = 700 / 50 / 900 / 500, dark = 400 / 950 / 950 / 100 / 400), tuned until the contrast test passes:

  | Theme | Light primary | Light accent / on-accent | Dark primary / on-primary | Dark accent / on-accent |
  | --- | --- | --- | --- | --- |
  | Indigo | `#4338ca` (as now) | `#eef2ff` / `#312e81` | `#818cf8` / `#1e1b4b` | `#1e1b4b` / `#e0e7ff` |
  | Ocean | `#0369a1` | `#f0f9ff` / `#0c4a6e` | `#38bdf8` / `#082f49` | `#082f49` / `#e0f2fe` |
  | Teal | `#0f766e` | `#f0fdfa` / `#134e4a` | `#14b8a6`* / `#042f2e` | `#042f2e` / `#ccfbf1` |
  | Forest | `#15803d` | `#f0fdf4` / `#14532d` | `#22c55e`* / `#052e16` | `#052e16` / `#dcfce7` |
  | Sunset | `#c2410c` | `#fff7ed` / `#7c2d12` | `#fb923c` / `#431407` | `#431407` / `#ffedd5` |
  | Rose | `#be123c` | `#fff1f2` / `#881337` | `#fb7185` / `#4c0519` | `#4c0519` / `#ffe4e6` |
  | Sakura | `#be185d` | `#fdf2f8` / `#831843` | `#f472b6` / `#500724` | `#500724` / `#fce7f3` |
  | Lavender | `#6d28d9` | `#f5f3ff` / `#4c1d95` | `#a78bfa` / `#2e1065` | `#2e1065` / `#ede9fe` |
  | Slate | `#334155` | `#f1f5f9` / `#0f172a` | `#94a3b8` / `#020617` | `#1e293b` / `#f1f5f9` |
  | Mocha | `#92400e` | `#fffbeb` / `#78350f` | `#d97706`* / `#451a03` | `#451a03` / `#fef3c7` |

  \* Changed in T017 (2026-11-24). The 400 shades (`#2dd4bf`, `#4ade80`, `#fbbf24`) failed one pair: the Progress calendar's `--heat-3` (60% primary on the dark card) under white day numbers, at 4.06, 3.84 and 3.66. Teal and Forest use their 500 shade; Mocha uses amber 600, since amber 500 reached only 4.49. All 20 combinations now pass.

  Light `--primary-foreground` is white for every theme. The swatch on the Appearance screen and the Me row is the theme's light primary.
- **Rationale**: the screenshot keeps neutral surfaces in every theme; six tokens per block keep 20 palettes reviewable and the contrast test small.
- **Alternatives**: full palettes per theme (40 more tokens per block, and status colours would drift); `color-mix` from one hue (contrast can't be guaranteed per theme).

## R5. Status colours next to similar accents

- **Decision**: Forest's primary equals `--success`, and Sunset, Rose and Sakura sit near `--destructive`. Status colours keep their hex values (FR-004), and every status already carries a label or icon (Done, Late, Needs redo, destructive button text), so meaning never rests on colour alone (spec Edge Cases). The e2e theme test takes a Forest screenshot of Today and a Rose one of a lesson for review.
- **Alternatives**: shifting status colours per theme (breaks FR-004); excluding those themes (the design has them).

## R6. Fonts: ten `next/font` families, only the chosen one used

- **Decision**: `src/app/fonts.ts` declares the ten families with `next/font/google`, each `{ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-<id>' }`. Static families get the weights the app uses: Poppins 400/500/600/700, Atkinson Hyperlegible 400/700, M PLUS Rounded 1c 400/500/700, Zen Maru Gothic 400/500/700. Inter stops being preloaded. All ten variable classes go on `<html>`; CSS picks one:

  ```css
  [data-font='nunito'] { --font-active: var(--font-nunito); }   /* one line per font */
  --font-sans: var(--font-active, var(--font-inter)), var(--font-noto-jp), var(--font-noto-my), ui-sans-serif, system-ui, sans-serif;
  ```

  Browsers download a face only when rendered text uses it, so outside Appearance a page downloads one Latin family plus Noto JP or Myanmar slices only for Japanese or Burmese text on it (FR-007, SC-005). On Appearance, each tile's name is set in its own family, which downloads that family's Latin subset (allowed by FR-007). `next/font`'s metric-adjusted fallback keeps the swap from moving the layout (US3 scenario 4). Code (`font-mono`) is untouched. M PLUS Rounded 1c and Zen Maru Gothic carry their own Japanese glyphs through their unicode-range slices; Burmese falls back to Noto Sans Myanmar.
- **Rationale**: self-hosted at build (works offline once cached by 008), one mechanism for all ten, no runtime font loader.
- **Changed in T039 (2026-11-24, the user's choice)**: M PLUS Rounded 1c and Zen Maru Gothic are Japanese fonts. Their `@font-face` CSS has a rule per Unicode slice and weight, which put ~550 KB of render-blocking CSS on every page and cut `/s/today` from ~80 to ~70 in Lighthouse. They now load on demand: `src/lib/lazy-fonts` reaches their `next/font` modules only through dynamic imports, and sets `--font-<id>` on `<html>`'s inline style. `LazyFontLoader` (root layout) loads one when `data-font` names it, and the font tiles load both on Appearance. Until a font arrives, its fallbacks show, as with any font still downloading. The tiles also switch to their own fonts only once the browser is idle, so they don't hold back the preview card's paint. Measurements: quickstart.md §5.
- **Alternatives**: Google Fonts `<link>` at runtime (third-party request, no offline); loading the chosen font with the Font Loading API (re-implements what the browser does lazily).

## R7. Text size: scale the root font and keep tap targets

- **Decision**: `html { font-size: calc(100% * var(--font-scale, 1)); --spacing: calc(0.25rem / min(1, var(--font-scale, 1))); }`, with Small 0.93, Default 1, Large 1.13 (the draft's 14 / 15 / 17 px steps as ratios; clarification Q1: all text).
  - Large: text and Tailwind spacing grow together, so fixed-height controls grow with their text and nothing overflows.
  - Small: text shrinks 7% while spacing stays at its Default size, so `h-11` targets stay 44 px (constitution V).
  - Arbitrary rem sizes in code scale with the text; arbitrary px sizes don't, and the task list audits them.
- **Rationale**: one variable, no per-component work, and the 44 px rule holds at every size.
- **Alternatives**: scaling Tailwind's `--text-*` only (misses the many arbitrary `text-[…rem]` sizes, and fixed-height controls would clip Large text); plain root scaling for Small too (tap targets drop to 41 px).

## R8. Data: CHECK constraints, no new columns

- **Decision**: the columns exist; a migration adds `profiles_theme_id_check` (the 10 ids), `profiles_font_id_check` (the 10 ids) and replaces the `font_scale` range with `profiles_font_scale_check` (`font_scale in (0.93, 1.00, 1.13)`). `schema.prisma` is unchanged (CHECKs are SQL-only), so the migration is written by hand in a new folder, as docs/data-model.md §7 allows. A precondition query on `DIRECT_URL` confirms no row holds another value first. The app maps `textSize` `small | default | large` ↔ `0.93 | 1.00 | 1.13` in one place (`src/lib/appearance.ts`).
- **Rationale**: the database refuses an id the CSS doesn't know (constitution: data integrity in SQL); names in the API keep the numbers in one module.
- **Alternatives**: Postgres enums (a type change on existing columns for no gain); Zod only (a bad row from SQL would render the default silently).

## R9. One Server Action for every appearance change

- **Decision**: `saveAppearance(input)` takes any of `colorMode`, `themeId`, `fontId`, `textSize` (at least one), guarded by `requireUser()`, updates `where: { id: me.id }`, writes the `appearance` cookie with the result, and returns the full appearance. It replaces 001's `setColorMode` (deleted). The view applies the change on the device first (`setTheme`, `<html>` attributes, the cache of `GET /api/me`), then saves; on error it restores the saved values and shows the error (FR-014). Concurrent changes: the last save wins.
- **Rationale**: one schema shared by the form and the action; one place writes the cookie.
- **Alternatives**: one action per field (four copies of the same guard, update and cookie write).

## R10. Browser bar colour follows mode only

- **Decision**: `viewport.themeColor` keeps its two `prefers-color-scheme` entries, so the server-rendered page is right for Auto. `AppearanceSync` sets the `content` of **both** `<meta name="theme-color">` tags (the light-scheme and the dark-scheme one) to the resolved mode's background (`#fafaf9` / `#0c0a09`) whenever `resolvedTheme` changes. That way an explicit Light or Dark choice wins whichever scheme the OS reports (FR-015, clarification Q3).
- **Alternatives**: the theme's primary as the bar colour (rejected by Q3).

## R11. The preview card is a static component

- **Decision**: `AppearancePreview` in `features/profile/components/` draws a Today-style card from sample strings: the time-of-day greeting with the viewer's name (`useDayPeriod`, moved from `today-view.tsx` to `src/components/shared/use-day-period.ts` as its second user), a "6-day streak" chip, the lesson "Particles は vs が" and "JLPT N4 Grammar · 15 min · 私は学生です。", a 60% progress bar, and "Focus 15" / "Mark complete" drawn as styled `span`s, not buttons (they do nothing, FR-011). The card is `role="img"` with an `aria-label`, so assistive tech reads it as one image; real `<button>`s inside `role="img"` would break axe's nested-interactive rule. It reads only `me.displayName`; it reacts to changes because it renders under the same `<html>` attributes.
- **Alternatives**: rendering real Today components with fixture data (pulls 003's and 004's internals into profile; an Admin has no Today).

## R12. Names and the Me row

- **Decision**: theme names are translated (`appearance.themes.<id>` in en / my / ja); font names come from the font list and are never translated (FR-013). The Me row's value becomes `"{theme} · {font} · {mode}"` with a 20 px swatch in the theme's light primary (11-Profile.png); its message replaces the hard-coded "Indigo · Inter".

## R13. Tests

- **Contrast (SC-002)**: `theme-contrast.test.ts` iterates the 10 themes × 2 modes, merging tokens like the cascade does (`:root` + theme block; `:root` + `.dark` + dark theme block), and runs the existing 37 pairs and heat pairs for each. A second test checks every theme in `src/lib/appearance.ts` has both blocks and every font has a `[data-font]` line.
- **Unit**: `parseAppearanceCookie` / `serializeAppearance` (valid, unknown parts, missing, tampered), the size mapping, the Zod schema, and the pre-paint script run in jsdom with a cookie (sets attributes and `localStorage.theme`; does nothing harmful on a bad cookie).
- **Dev DB**: `saveAppearance` updates only the caller, refuses unknown ids, writes the cookie; the sign-in path writes the cookie from the profile.
- **pgTAP**: the three CHECKs; a user can't change another profile's appearance (existing RLS, asserted for these columns).
- **Playwright** (390×844 and 1280×800, axe): us1-themes (pick Sakura → `--primary` on a button, the Me row, a second browser context opens in Sakura; Dark keeps Sakura); us2-fonts (Atkinson + Large → computed `font-family` and root size; no sideways scroll on Today, Courses, a lesson, Shifts, Progress, Me, Admin Students, Plan and Alerts at Large; Small keeps a 44 px button); us3-first-paint (an init script records `<html>` attribute changes; all happen before first contentful paint on reload, and exactly one switch after a change made in another context); us4-mode-language (Light / Dark / Auto with an emulated colour scheme switching live; English → 日本語 → မြန်မာ changes the Appearance screen's text and a date on Today). 001 has no e2e for mode or language, so US4's regression checks are new tests.

## R14. Both roles, one view

- **Decision**: `/s/me/appearance` and `/a/me/appearance` keep rendering the one `AppearanceView`; both layouts render `AppearanceSync`. No role checks beyond `requireUser()`: everyone edits only their own profile row.
