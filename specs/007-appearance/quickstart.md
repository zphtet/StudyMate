# Quickstart: Appearance — Themes, Fonts, Text Size

How to check 007 end to end. Details live in [data-model.md](data-model.md) and [contracts/](contracts/).

## 1. Prerequisites

- `.env` points at the dev Supabase project (as for 001–006). No new environment variables or packages: the ten fonts come from `next/font/google`, which downloads them at build time (the build needs network access once).
- Seeded users May (student, Tokyo) and Zin (Admin) from the e2e fixtures, or any two accounts.

## 2. Apply and check the database

```bash
# precondition (data-model.md › Migration): must print 0
psql "$DIRECT_URL" -c "select count(*) from profiles where theme_id not in ('indigo','ocean','teal','forest','sunset','rose','sakura','lavender','slate','mocha') or font_id not in ('inter','nunito','poppins','dm-sans','manrope','roboto','atkinson','merriweather','m-plus-rounded','zen-maru') or font_scale not in (0.93,1.00,1.13)"
pnpm prisma migrate deploy      # the 007 CHECK migration
pnpm test:db                    # + supabase/tests/007_appearance_checks.test.sql
```

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test        # contrast for 10 themes × 2 modes, appearance cookie and script, schemas, saveAppearance
pnpm test:e2e    # us1-themes, us2-fonts, us3-first-paint, us4-mode-language (390×844 + 1280×800, axe)
```
Run Playwright against a production build on :3100 (`pnpm build && PORT=3100 pnpm start`, then `PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e`); leave the dev server on :3000 alone, and check no other session is using :3100 or the dev DB first. While developing, run one smoke test per story.

## 4. Manual scenarios (390×844 first)

| # | Do | Expect |
| --- | --- | --- |
| 1 | As May, Me → Appearance | Preview, Mode, Colour theme · Indigo, Font · Inter, Text size, matching `12-Appearance.png` |
| 2 | Tap Sakura | Preview button, Me row swatch, tab bar, progress bars and the Progress heat calendar turn pink at once; no Save button (US1) |
| 3 | Switch Dark, then Auto, then toggle the OS scheme | Sakura's dark palette; Auto follows the OS live (US1 s4, US4) |
| 4 | Look at Today with Forest, a late lesson with Rose | "Done", "Late" and "Needs redo" keep their own colours and labels (FR-004) |
| 5 | Pick Atkinson Hyperlegible, then Large | All text in Atkinson and bigger; Japanese in a lesson uses a Japanese face; Burmese UI (switch language) a Burmese face; no sideways scroll on Today, Courses, a lesson, Shifts, Progress, Me (US2) |
| 6 | Pick Small | Text smaller; buttons still 44 px tall (DevTools) |
| 7 | DevTools → Network, reload Today | One Latin font family downloaded (plus Noto JP slices if Japanese text is on screen) (SC-005) |
| 8 | Throttle to "Slow 4G", reload Today, Courses, sign-in 10 times | First frame already in the chosen theme, mode and size; no Indigo flash (US3, SC-003) |
| 9 | Sign in as May in a second browser | Opens in May's look from the first screen after sign-in (US3 s3) |
| 10 | Change theme in browser A, reopen the app in browser B | B switches once on that open, then opens in the new theme every time (US3 s5) |
| 11 | Turn the network off, pick a theme | It goes back to the saved theme and an error toast shows (FR-014) |
| 12 | Sign out | Sign-in page keeps the last look (US3 s2) |
| 13 | As Zin, `/a/me/appearance` at 390 and 1280 | Same screen; Admin screens follow the theme (Students, Plan, Alerts) |
| 14 | Pick Light or Dark on an installed phone app | Status bar matches the app background, not the theme colour (FR-015) |
| 15 | Switch to မြန်မာ and 日本語 | Theme names, headings and size labels translated; font names unchanged (FR-013) |
