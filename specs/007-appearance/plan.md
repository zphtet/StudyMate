# Implementation Plan: Appearance — Themes, Fonts, Text Size

**Branch**: `007-appearance` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-appearance/spec.md`, clarified on 2026-11-24 with four answers:
- text size scales all text;
- themes change only the accent, never backgrounds, body text or status colours;
- the browser and status bar follow Light or Dark, not the theme;
- a change made on another device may show as one switch on the next open.

Two screenshot details are kept on purpose (contracts/ui-routes.md).

## Summary

Each Student and Admin picks a colour theme (10, each in light and dark), a font (10) and a text size (3) on Me → Appearance, next to 001's Mode. The choice is saved to their account, applied at once on the device, and shown from the first frame on every later open, signed in or out. Language and Mode were built in 001 and get regression tests here.

The profile columns exist since `0_init`, and 001 built Mode with `next-themes` plus Language with a cookie and a pre-paint `lang` script. The feature adds:
- **CHECKs** on `theme_id`, `font_id` and `font_scale`, in a hand-written migration (research R8);
- **the `appearance` cookie** (`mode.theme.font.size`) and a pre-paint script that sets `data-theme`, `data-font` and `--font-scale` on `<html>`, and seeds `next-themes` (R1, R2). `AppearanceSync` replaces `ThemeSync`, switching once when the account changed elsewhere and keeping the browser bar colour in step (R3, R10);
- **9 accent-only theme blocks** in `globals.css`, plus a contrast test over all 20 theme × mode combinations (R4, R13);
- **10 `next/font` families**, never preloaded, picked by `[data-font]`, so only the chosen one downloads (R6);
- **text size** as a root font scale, with spacing held at Small so tap targets stay 44 px (R7);
- **one Server Action**, `saveAppearance`, replacing `setColorMode` and writing the cookie (R9);
- **the full Appearance screen**: preview card, swatches, font tiles, size control; and the Me row with swatch and "{Theme} · {Font} · {Mode}" (contracts/ui-routes.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies**: no new packages.
- `next/font/google`: 10 families (R6).
- `next-themes`: mode, unchanged.
- Also used: next-intl, TanStack Query 5, Zod 4, Tailwind CSS 4.3 (`--spacing`, `@theme inline`), shadcn/ui (Button, Progress).

**Storage**:
- `profiles.color_mode`, `theme_id`, `font_id`, `font_scale` (existing) with new CHECKs. No new tables, policies, Storage or Realtime.
- On the device: the `appearance` cookie and next-themes' `localStorage.theme`.

**Testing**:
- Vitest:
  - the contrast test over 10 themes × 2 modes, plus a test that every listed theme and font has its CSS;
  - `src/lib/appearance.ts`: cookie parse and serialize, the size mapping, the pre-paint script in jsdom;
  - the `saveAppearance` schema, and the action against the dev DB.
- pgTAP: the three CHECKs, and no cross-user update.
- Playwright: us1-themes, us2-fonts, us3-first-paint and us4-mode-language at 390×844 and 1280×800 with axe, on a production build on :3100.

**Target Platform**: mobile browsers first (iOS Safari 16.4+, Android Chrome), then desktop; Vercel.

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- A theme or mode change is visible within 0.1 s, with no layout movement (SC-001). It's an attribute or class swap on `<html>`, so CSS variables update and nothing reflows.
- First paint uses the saved look (SC-003): an inline script in `<head>`, so no request waits on it.
- At most one Latin UI family per page outside Appearance (SC-005); Inter is no longer preloaded.
- Lighthouse performance ≥ 90 on `/s/today` and `/s/me/appearance` (mobile). The Appearance page downloads the 10 Latin subsets lazily as its tiles render.

**Constraints**:
- Cache Components is on, so the root layout can't read cookies (R1).
- Tap targets stay ≥ 44 px at Small (R7).
- Status, shift and course colours are fixed across themes (FR-004).
- Offline first paint relies on 008 caching the app shell; the cookie and script already work offline.
- No pronouns for students in any language.

**Scale/Scope**:
- One screen rebuilt (Appearance, both roles) and one Me row changed.
- 20 palettes, 10 font families, 3 sizes.
- All text in 3 languages, about 25 new strings.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 007 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. `saveAppearance` calls `requireUser()` and writes `where: { id: me.id }`. Existing profile RLS limits updates to the user's own row, and pgTAP asserts it for these columns. | ✅ | ✅ |
| II. Spec first | 4 recorded clarifications; screenshot differences listed in contracts/ui-routes.md. | ✅ | ✅ |
| III. Test-first | The contrast test and the `appearance.ts` unit tests come before the CSS and the script; pgTAP before the migration; one Playwright spec per user story (US4's are new: 001 had none). | ✅ | ✅ |
| IV. Time | Not affected (the preview's greeting uses the viewer's local time, as Today does). | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | This feature delivers the "10 themes, 4.5:1 in light and dark" rule, checked automatically for all 20 combinations. Tap targets stay 44 px at Small (R7). Swatches, tiles and segments are labelled radios. Tokens only. | ✅ | ✅ |
| VI. Three languages | Theme names and every label in `en`/`my`/`ja`. Font stacks always end in Noto Sans JP and Noto Sans Myanmar. Font names aren't translated. | ✅ | ✅ |
| VII. Stack | `next-themes`, `next/font`, shadcn CSS variables and Tailwind v4 as named. Prisma for the profile; reads via `GET /api/me` + `queryOptions`; writes via `useMutation` + a Server Action with one Zod schema. The pre-paint script follows 001's `lang` script (Complexity Tracking). | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db and build pass; Appearance matches `12-Appearance.png`, Me matches `11-Profile.png`; spec status updated. | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| See and change own mode, theme, font, text size | ✓ | ✓ | `requireUser()` + `where: { id: me.id }` |
| See or change anyone else's appearance | – | – | none offered; RLS refuses it |
| Read own appearance (`GET /api/me`, layouts) | ✓ | ✓ | `requireUser()` / `requirePageUser()` (existing) |

## Project Structure

### Documentation (this feature)

```text
specs/007-appearance/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R14
├── data-model.md        # profile CHECKs, theme and font lists, device state, migration, guards
├── quickstart.md        # prerequisites, commands, manual scenarios
├── checklists/requirements.md
├── contracts/
│   ├── server-actions.md
│   ├── route-handlers.md
│   └── ui-routes.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── lib/appearance.ts (+ .test)                # themes, fonts, sizes; cookie parse/serialize; pre-paint script
├── app/
│   ├── fonts.ts                               # 10 next/font families + Noto JP/Myanmar (R6)
│   ├── layout.tsx                             # font classes on <html>; appearance script next to lang
│   ├── globals.css                            # 9 × 2 theme blocks, [data-font] lines, --font-scale, --spacing
│   └── theme-contrast.test.ts                 # 10 themes × 2 modes; every theme/font has its CSS
├── components/shared/
│   ├── appearance-sync.tsx                    # replaces theme-sync.tsx (R3, R10)
│   └── use-day-period.ts                      # moved out of today-view.tsx (second user)
├── app/s/layout.tsx · app/a/layout.tsx        # render AppearanceSync with me's four values
├── features/profile/
│   ├── schemas.ts (+ .test)                   # saveAppearanceSchema; colorModes enum kept, colorModeSchema removed
│   ├── actions.ts                             # saveAppearance; setColorMode removed
│   ├── repo.ts · types.ts                     # MeResponse + themeId, fontId, textSize
│   └── components/
│       ├── appearance-view.tsx                # preview, Mode, theme, font, size
│       ├── appearance-preview.tsx             # the static sample card (R11)
│       ├── theme-swatches.tsx · font-tiles.tsx · segmented-choice.tsx   # Mode and Text size share it
│       └── me-view.tsx                        # Appearance row: swatch + "{theme} · {font} · {mode}"
├── features/auth/preferences.ts · actions.ts  # appearance cookie on sign-in / code verification
├── features/assignments/components/today-view.tsx   # imports the shared useDayPeriod
└── i18n/messages/{en,my,ja}.json              # appearance.*, appearance.themes.*, me.appearanceValue

prisma/migrations/<UTC timestamp>_appearance_checks/migration.sql
supabase/tests/007_appearance_checks.test.sql
tests/e2e/us1-themes · us2-fonts · us3-first-paint · us4-mode-language .spec.ts
tests/e2e/fixtures/appearance.ts               # set a profile's look; read <html> attributes
```

**Structure Decision**: one Next.js app, as in 001–006.
- **`src/lib/appearance.ts`**: the theme, font and size lists and the cookie format live here. The root layout, `features/profile`, `features/auth` and `AppearanceSync` all use them.
- **The screen stays in `features/profile`**, where 001 put Appearance and Me.
- **`segmented-choice.tsx`** gives Mode and Text size one control. Both live in this feature, so it stays local until a third user appears.
- **`useDayPeriod` moves to `components/shared`** because the preview is its second user across features; the rule is not to import another feature's internals.

**Documentation updates in this feature**:
- `docs/technical-spec.md`:
  - §11 as built: the `appearance` cookie and pre-paint script instead of server-rendered `data-theme`; accent-only blocks; `[data-font]` with `--font-active`; `--font-scale` with the `--spacing` hold; no Inter preload;
  - §3: `lib/appearance.ts`, `app/fonts.ts`, `components/shared/appearance-sync.tsx`.
- `docs/data-model.md`: the three CHECKs and `font_scale`'s allowed values.
- `specs/007-appearance/spec.md`: Status → Implemented when done.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| An inline `<head>` script (`dangerouslySetInnerHTML`) reads the `appearance` cookie, instead of technical-spec §11's server-rendered `data-theme` | Cache Components makes a cookie read in the root layout request-bound for every page; the script is the only way to paint the saved look first without that (R1) | Server-rendered attributes would turn off static shells app-wide. The script is a fixed string from `lib/appearance.ts`, unit-tested, and follows 001's `lang` script. |
| A hand-written migration with no `schema.prisma` change | CHECK constraints are SQL-only (constitution VII) | Zod-only validation would let a value set from SQL render as the default without warning. |
| Overriding Tailwind's `--spacing` when the scale is below 1 | Keeps 44 px tap targets at Small text (constitution V) while text shrinks (R7) | Scaling the root alone gives 41 px targets at Small; scaling only `--text-*` misses arbitrary sizes and clips text at Large. |
