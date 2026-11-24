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

## _review: strings for a native speaker (T035)

007 adds 25 keys and changes one (`me.appearanceValue`); all exist in `my` and `ja` with the same placeholders as `en` (`messages.test.ts` passes). The sample lesson (`appearance.previewLesson`, `appearance.previewMeta`) stays as in the design in every language, to show Japanese in the chosen font (spec Assumptions). Font names are never translated (FR-013). No string refers to a student with a pronoun.

| Idea | Burmese | Japanese | Note |
| --- | --- | --- | --- |
| Appearance | အသွင်အပြင် | 外観 | from 001 |
| Preview (the sample card's label) | အစမ်းကြည့်ရှုမှု | プレビュー | |
| Colour theme | အရောင်အပြင်အဆင် | カラーテーマ | |
| Font | ဖောင့် | フォント | |
| Text size: Small / Default / Large | စာလုံးအရွယ်အစား: သေး / ပုံမှန် / ကြီး | 文字サイズ: 小 / 標準 / 大 | |
| "{n}-day streak" | {n} ရက် ဆက်တိုက် | {n}日連続 | |

**Theme names need a native speaker most.** Japanese uses the usual loanwords, with 桜 for Sakura. The Burmese names are a first draft; please check that they read as colour names, not as the things themselves:

| Theme | Burmese | Japanese |
| --- | --- | --- |
| Indigo | မဲနယ် | インディゴ |
| Ocean | သမုဒ္ဒရာ | オーシャン |
| Teal | စိမ်းပြာ | ティール |
| Forest | သစ်တော | フォレスト |
| Sunset | နေဝင် | サンセット |
| Rose | နှင်းဆီ | ローズ |
| Sakura | ဆာကူရာ | 桜 |
| Lavender | လာဗင်ဒါ | ラベンダー |
| Slate | ကျောက်ပြား | スレート |
| Mocha | မိုကာ | モカ |

Questions:
- Is မဲနယ် (indigo dye) understood as the colour, or should it be a transliteration (အင်ဒီဂို)?
- Does a two-line Burmese "Auto" (အလိုအ / လျောက်) in the Mode control read naturally at Large text, or is a shorter word better?

## 5. Performance (T039, 2026-11-24)

Measured on `pnpm build && pnpm start` (localhost, dev Supabase over the internet), Lighthouse 12.8.2, mobile, performance only, signed in (session cookies passed with `--extra-headers` from a throwaway Playwright test), 3 runs each. The account's look was the default, so the device and the account agree.

| Page | `main` (before 007) | 007 as first built | 007 as shipped |
| --- | --- | --- | --- |
| `/s/today` | 77–82 (FCP 1.2–1.7 s, LCP 3.6–4.1 s) | 70–71 (FCP 2.7 s, LCP 4.4–4.7 s) | **77–84** (FCP 1.7–2.0 s, LCP 3.5–3.9 s) |
| `/s/me/appearance` | – | 66–69 (LCP 6.8–8.1 s) | **79–80** (FCP 1.7–2.0 s, LCP 4.5 s, CLS 0) |

- **Found and fixed**:
  - M PLUS Rounded 1c and Zen Maru Gothic are Japanese fonts. `next/font` writes an `@font-face` rule for every Unicode slice and weight, which put ~550 KB of render-blocking CSS on every page for every user (render-blocking CSS grew from ~210 KB to ~790 KB). They now load on demand (`src/lib/lazy-fonts`, the user's choice in T039): only when chosen, and on Appearance. Without them the CSS is ~231 KB.
  - On Appearance, the tiles switch to their own fonts once the browser is idle, so their ~760 KB no longer holds back the preview card's largest paint.
- **Still below the 90 target, as for 003–006's pages**: LCP waits for data seeded on the server from the dev database over the internet. Worth re-measuring on Vercel next to the database.
- **CLS 0.18 on `/s/today` already exists on `main`**: Today's "Nothing due today" card moves when content above it appears after the first paint. Not caused by 007; follow-up for the Today screen's owner (006's Turn on reminders card is the likely cause).
- **SC-001**: a theme change repaints in 27–40 ms (Ocean, Rose, Slate; tap to the next frame), with layout shift 0.
- **SC-005**: `/s/today` downloads one font file with Inter, and one with Nunito; the Japanese and Burmese fallbacks only load for text in those scripts. Appearance downloads the ten families (allowed by FR-007).
