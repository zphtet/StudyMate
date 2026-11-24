---
description: "Tasks for 007 Appearance — Themes, Fonts, Text Size"
---

# Tasks: Appearance — Themes, Fonts, Text Size

**Input**: Design documents from `specs/007-appearance/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**:
- plan.md and spec.md (clarified 2026-11-24, four answers).
- 001–006 merged on `main`. The tasks rely on:
  - from 001: Mode (`next-themes`, `setColorMode`, `ThemeSync`), Language (`setLocale`, the `locale` cookie, `setPreferenceCookies`), the `lang` pre-paint script in `src/app/layout.tsx`, `AppearanceView` on `/s/me/appearance` and `/a/me/appearance`, and the Me row;
  - the Indigo tokens in `src/app/globals.css` and `src/app/theme-contrast.test.ts`;
  - the e2e fixtures `createConfirmedUser`, `signIn`/`signedIn`, `linkStudent` and `sql`.
- Out of scope: offline first paint (008 caches the app), organisation-wide defaults, custom colours and per-device appearance.

**Tests**: required by constitution III (test-first):
- pgTAP for the migration's CHECKs;
- Vitest unit tests for `src/lib/appearance.ts` and the schema, and the contrast test for all 20 theme × mode combinations, written and failing before the code;
- a repo test against the dev database for saving appearance;
- Playwright for every user story at 390×844 and 1280×800 with axe, on a production build on :3100. Leave the dev server on :3000 alone, and before any DB-backed or e2e run check that no other session is running tests or a :3100 server.

While implementing, run one happy-path Playwright test per story with `--grep`; the whole files run in the gates task (T036).

**Organization**: grouped by user story in the spec's priority order:
- **US1** (P1): colour themes, the screen's new layout and the Me row;
- **US2** (P2): fonts and text size;
- **US3** (P2): the right look from the first frame, including changes made on another device;
- **US4**: regression checks for 001's Mode and Language (001 has no e2e for them).

The pre-paint script, the cookie and the one Server Action are Foundational, because every story's change has to apply and save through them.

**Changes to plan.md › Source Code** (CLAUDE.md › Single responsibility; Tests check behaviour):

| Module | plan.md | Here | Why |
| --- | --- | --- | --- |
| `applyAppearance(doc, look)` | not named | `src/lib/appearance.ts` | the view, `AppearanceSync` and the script's tests need one way to set `<html>`'s attributes |
| saving the profile | inside the action | `saveAppearance(userId, input)` in `src/features/profile/repo.ts` | keeps the action thin and lets a dev-DB test cover it without a request context |
| the view's apply, save and revert | inside `appearance-view.tsx` | `use-appearance.ts` hook in `features/profile/components/` | Mode, theme, font and size all use it |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Field rules cite `data-model.md` (`Entity.field`) instead of repeating them.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the database precondition and one shared move. Branch `007-appearance` already exists.

- [X] T001 Check the dev database precondition on `DIRECT_URL` with the query in quickstart.md §2 (data-model.md Profile.theme_id, Profile.font_id, Profile.font_scale). If the count isn't 0, stop and report the rows' values. Record the result here. (2026-11-24: 0. All 1301 profiles are `indigo` / `inter` / 1.00. The existing range CHECK is named `profiles_font_scale_check`, as data-model.md expects.)
- [X] T002 [P] Move `useDayPeriod` from src/features/assignments/components/today-view.tsx to src/components/shared/use-day-period.ts (exported; research R11: the preview card is its second user). Update today-view.tsx's import. No behaviour change. Commit on its own.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the CHECKs, the theme/font/size lists and cookie format, the pre-paint script, the fonts on `<html>`, the text-size CSS, and `saveAppearance`. After this phase every change can apply and save; the stories add the screen's controls.

**⚠️ CRITICAL**: no user story work starts until this phase is complete.

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [X] T003 [P] Write pgTAP tests in supabase/tests/007_appearance_checks.test.sql (data-model.md › Migration). Wrap them in `begin … rollback`, switching users with `set local role authenticated` and `request.jwt.claims` as 005_shift_policies.test.sql does. Cases:
  - each of the 10 theme ids and 10 font ids is accepted, and `'pink'` / `'comic-sans'` are refused (data-model.md Profile.theme_id, Profile.font_id);
  - `font_scale` 0.93, 1.00 and 1.13 are accepted, and 0.90 and 1.25 are refused (data-model.md Profile.font_scale);
  - as May, an update of Zin's `theme_id` changes 0 rows, and an update of her own changes 1.
- [X] T004 [P] Write unit tests in src/lib/appearance.test.ts (research R1, R7; data-model.md › Device state). Cases:
  - `themeIds` and `fontIds` are exactly the lists in data-model.md Profile.theme_id and Profile.font_id; every theme has a `swatch` hex, and every font a display name;
  - `textSize` ↔ `fontScale`: `small` ↔ 0.93, `default` ↔ 1, `large` ↔ 1.13, and a Prisma `Decimal` of 1.13 maps to `large`;
  - `serializeAppearance` / `parseAppearanceCookie` round-trip; a missing cookie gives `system.indigo.inter.default`; each unknown part (`dark.pink.inter.default`, `x.ocean.x.huge`) falls back to its own default while the valid parts are kept;
  - `applyAppearance(document, look)`: sets `data-theme` (and removes it for Indigo), `data-font` and `--font-scale`;
  - `appearanceScript` (the inline string), run in jsdom with `document.cookie` set: the same attributes, plus `localStorage.theme` = the mode. With a garbage cookie it sets the defaults; with `localStorage` throwing, it still sets the attributes.
- [X] T005 [P] Extend src/app/theme-contrast.test.ts (research R4, R13; FR-005, SC-002):
  - iterate the 10 themes from `themeIds`. Light = `:root` tokens overlaid with `[data-theme='<id>']`; dark = `:root` + `.dark` + `.dark[data-theme='<id>']`. Indigo is `:root` / `.dark` alone;
  - run the existing pairs and heat pairs for each of the 20;
  - add: every non-Indigo theme has both blocks, and each block sets exactly `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--ring`, `--chart-1`;
  - add: every font in `fontIds` has a `[data-font='<id>']` line.

  The 18 new combinations fail until T017.
- [X] T006 [P] In src/features/profile/schemas.test.ts, replace the `describe('colorModeSchema')` block (T010 removes that schema) with tests for `saveAppearanceSchema` (contracts/server-actions.md):
  - each of `light`, `dark` and `system` is accepted as `colorMode`, carrying over the old block's cases;
  - one field is enough;
  - `{}` is refused with `invalid_input`;
  - an unknown `themeId`, `fontId` or `textSize` is refused.
- [X] T007 [P] Write tests against the dev DB in src/features/profile/repo.test.ts for `saveAppearance(userId, input)` and `getMe` (contracts/route-handlers.md). Use a throwaway user, as other repo tests do. Cases:
  - saving `{ themeId: 'sakura' }` changes only that field, and returns all four;
  - `textSize: 'large'` stores `font_scale` 1.13 (data-model.md Profile.font_scale);
  - a second user's row is untouched;
  - `getMe` returns `themeId`, `fontId` and `textSize`.

### Implementation

- [X] T008 Write prisma/migrations/<UTC timestamp>_appearance_checks/migration.sql by hand (data-model.md › Migration; docs/data-model.md §7; `schema.prisma` is unchanged):
  - add `profiles_theme_id_check` (data-model.md Profile.theme_id);
  - add `profiles_font_id_check` (data-model.md Profile.font_id);
  - drop `profiles_font_scale_check` and re-add it with the three allowed values (data-model.md Profile.font_scale).

  Apply it with `pnpm prisma migrate deploy`, then run `pnpm test:db` until T003 passes.
- [X] T009 [P] Create src/lib/appearance.ts (T004 passes). Pure and client-safe. It holds:
  - `themes` (id, swatch) and `fonts` (id, name), plus `themeIds` and `fontIds` as tuples for `z.enum`;
  - `textSizes`, `toTextSize(fontScale)` and `toFontScale(textSize)`;
  - `APPEARANCE_COOKIE`, `serializeAppearance`, `parseAppearanceCookie`, `applyAppearance`;
  - `appearanceScript`: a minified string built from the same lists, so the script and the app can't disagree.

  The swatch hexes are the light primaries in research R4.
- [X] T010 Add `saveAppearanceSchema` to src/features/profile/schemas.ts (contracts/server-actions.md › Field schemas). Keep `colorModes` and `ColorMode`, and drop the `colorModeSchema` object wrapper. T006 passes.
- [X] T011 Extend the profile read and add the save (contracts/route-handlers.md, contracts/server-actions.md). T007 passes.
  - src/features/profile/types.ts: `MeResponse` gains `themeId`, `fontId` and `textSize`.
  - src/features/profile/repo.ts: `getMe` selects `themeId`, `fontId` and `fontScale`, mapping them with `toTextSize`. Add `saveAppearance(userId, input)` (`where: { id: userId }`; data-model.md Profile.color_mode, Profile.theme_id, Profile.font_id, Profile.font_scale). Narrow unknown stored values to the defaults.
- [X] T012 Write the action and the cookies (contracts/server-actions.md; research R9):
  - src/features/profile/actions.ts: `saveAppearance` = `requireUser()` → repo → write the cookie → return. Delete `setColorMode`.
  - src/features/auth/preferences.ts: `setPreferenceCookies` also writes `appearance` (via `serializeAppearance`) when it gets the four fields.
  - src/features/auth/actions.ts: `signIn` and `verifyEmailCode` select `colorMode`, `themeId`, `fontId` and `fontScale`, and pass them.
  - src/features/auth/components/sign-in-form.tsx and verify-email-form.tsx: on success, before `router.replace`, apply the new cookie with `applyAppearance(document, parseAppearanceCookie(document.cookie))` and `setTheme(mode)` (research R1). A client-side navigation doesn't re-run the pre-paint script, so without this the first screen after sign-in would show the device's old look.
  - src/features/profile/components/appearance-view.tsx: the Mode control calls `saveAppearance({ colorMode })`, so the build stays green. The full screen comes in US1.
- [X] T013 Add the fonts and the script (research R1, R6):
  - create src/app/fonts.ts with the 10 `next/font/google` families plus Noto Sans JP and Noto Sans Myanmar, all `preload: false`, `display: 'swap'`, `variable: '--font-<id>'`. Static families get the weights in research R6;
  - src/app/layout.tsx: put every font's variable class on `<html>`, and add `<script dangerouslySetInnerHTML={{ __html: appearanceScript }} />` right after the `lang` script. Inter is no longer imported or preloaded on its own.
- [X] T014 Add the font and size rules to src/app/globals.css (research R6, R7):
  - one `[data-font='<id>'] { --font-active: var(--font-<id>); }` line per font;
  - `--font-sans` starts with `var(--font-active, var(--font-inter))`, then Noto JP, Noto Myanmar, system;
  - in `@layer base`: `html { font-size: calc(100% * var(--font-scale, 1)); }`, and the `--spacing` hold (`calc(0.25rem / min(1, var(--font-scale, 1)))`), set where Tailwind's own `--spacing` is overridden;
  - check with DevTools that `h-11` is 44 px at 0.93 and 1, and 49.7 px at 1.13.

  T005's font check passes.

**Checkpoint**: `pnpm typecheck`, `pnpm lint`, `pnpm test` (the new units) and `pnpm test:db` pass. Setting `appearance=dark.indigo.nunito.large` by hand in DevTools and reloading shows dark Indigo in large Nunito from the first frame.

---

## Phase 3: User Story 1 – Pick a colour theme (Priority: P1) 🎯 MVP

**Goal**: 10 themes in light and dark; the Appearance screen with the preview, Mode and Colour theme; the Me row; saved to the account.

**Independent Test**: as May, pick Sakura: the preview, buttons, progress bars, tab bar and heat calendar turn Sakura at once. Dark keeps Sakura. A second browser signing in as May opens in Sakura.

### Tests for User Story 1 (write first, see them fail)

- [X] T015 [P] [US1] Create the e2e fixtures in tests/e2e/fixtures/appearance.ts:
  - `setAppearance(userId, look)`: SQL on `profiles` (data-model.md Profile.color_mode, Profile.theme_id, Profile.font_id, Profile.font_scale);
  - `htmlLook(page)`: `data-theme`, `data-font`, `--font-scale`, `.dark`;
  - `primaryOf(page)`: the computed `--primary`.

  Reset May to the defaults in `beforeEach` of every appearance spec.
- [X] T016 [P] [US1] Write Playwright tests in tests/e2e/us1-themes.spec.ts (390×844 and 1280×800, axe; contracts/ui-routes.md). Cases:
  - **scenario 1**: Appearance shows Preview, Mode, "Colour theme · Indigo", Font and Text size, in that order;
  - **scenario 2**: tap Sakura → `data-theme="sakura"`, "Colour theme · Sakura", the swatch is checked, a primary button's background is Sakura's light primary, and the profile row says `sakura`;
  - **scenario 4**: choose Dark → `.dark` with `data-theme="sakura"`, and `--primary` is Sakura's dark primary;
  - **scenario 5**: with Rose, a late lesson's chip keeps `--destructive`;
  - **scenario 6, new device**: a new browser context signs in as May → `data-theme="sakura"` on the first screen. The case of a device that is already signed in is US3's (T029 scenario 5, after T030);
  - **scenario 7**: Me shows "Sakura · Inter · Auto" and a swatch;
  - **FR-014**: abort the Server Action's request → the previous theme comes back and an error toast shows;
  - Zin's `/a/me/appearance` works the same.

### Implementation for User Story 1

- [X] T017 [US1] Add the 9 × 2 theme blocks to src/app/globals.css after `.dark` (research R4: only the six tokens; values from the R4 table). Adjust a value only where T005 fails, and note any change against research R4. T005 passes for all 20.
- [X] T018 [US1] Write the hook src/features/profile/components/use-appearance.ts (research R9; FR-014). It returns the saved look from `meQuery` and `change(partial)`:
  - apply at once (`applyAppearance(document, …)`, and `setTheme` for mode);
  - update the `['me']` cache;
  - `useMutation` → `saveAppearance`;
  - on error, re-apply the previous look, restore the cache and `toast.error(errorMessage(error))`.
- [X] T019 [US1] Build the components in src/features/profile/components/ (contracts/ui-routes.md › Appearance screen; 12-Appearance.png):
  - `segmented-choice.tsx`: extracted from today's Mode radiogroup, so Mode and Text size share it; each option can carry a `className` for its label size;
  - `theme-swatches.tsx`: 5-column radiogroup, ≥ 44 px round swatches using each theme's `swatch`, a ring and check on the selected one, the translated name under it;
  - `appearance-preview.tsx` (research R11; FR-011): `useDayPeriod` and `me.displayName`; the card is `role="img"` with an `aria-label`. "Focus 15" and "Mark complete" are styled `span`s, never `<button>` (axe nested-interactive);
  - `appearance-view.tsx`: Preview, Mode, "Colour theme · {name}", via `useAppearance`. Remove the "coming soon" note.
- [X] T020 [US1] Update the Me row in src/features/profile/components/me-view.tsx (FR-012; 11-Profile.png): a 20 px swatch as the icon, and the value `t('me.appearanceValue', { theme, font, mode })`, with `font` from `fonts` (not translated). Both roles use this view.
- [X] T021 [US1] Add the strings to src/i18n/messages/en.json, my.json and ja.json (FR-013):
  - `appearance.preview`, `appearance.colourTheme` (`"Colour theme · {name}"`) and `appearance.themes.<id>` for all 10;
  - the preview's `previewStreak` (`"{n}-day streak"`), `previewLesson`, `previewMeta`, `focus15` and `markComplete`. The lesson title and meta stay as in the design in every language;
  - change `me.appearanceValue` to `"{theme} · {font} · {mode, select, …}"`;
  - delete `appearance.more`.

  No pronouns for students.
- [X] T022 [US1] Run src/app/theme-contrast.test.ts (T005) and tests/e2e/us1-themes.spec.ts scenario 2 (T016) with `--grep` on the :3100 build until they pass.

**Checkpoint**: quickstart.md §4 scenarios 1–4 and 13 pass by hand.

---

## Phase 4: User Story 2 – Pick a font and text size (Priority: P2)

**Goal**: 10 font tiles and the Small / Default / Large control; every screen usable at Large.

**Independent Test**: pick Atkinson Hyperlegible and Large: Today, a lesson and Shifts show bigger Atkinson text; Japanese in the lesson uses a Japanese face; nothing scrolls sideways at 390 px.

### Tests for User Story 2 (write first, see them fail)

- [X] T023 [P] [US2] Write Playwright tests in tests/e2e/us2-fonts.spec.ts (390×844 and 1280×800, axe). Cases:
  - **scenario 1**: tap Atkinson Hyperlegible → `data-font="atkinson"`, "Font · Atkinson Hyperlegible", and Today's heading's computed `font-family` starts with Atkinson's `next/font` family;
  - **scenario 2**: a lesson with Japanese text, with Merriweather → the `font-family` stack includes the Noto Sans JP family;
  - **scenario 3**: Large → the root font size is 1.13× the default; Small → 0.93×;
  - **scenario 4** (SC-004: every screen of both roles): at Large, `scrollWidth ≤ clientWidth` on every page route.
    - Every `page.tsx` under src/app/s (14) and src/app/a (20), as of this plan:
      - May: Today, Courses, a course, a lesson, Progress, Shifts, a shift, new shift, the rotation, Me, Appearance, Account, My reminders, Inbox;
      - Zin: Students, a student, a student's lesson, Courses, a course, new course, edit course, the lesson editor, deleted courses, Plan, Alerts, new rule, a rule, new message, a message, Me, Appearance, Account, Inbox, Welcome.
    - Also the signed-out pages: sign-in, sign-up.

    Seed whatever each route needs with the existing fixtures, and loop over a route table, not one test per page. At Small, a `size="touch"` button is ≥ 44 px tall;
  - **scenario 5**: the preview's text grows at Large before leaving the screen.

### Implementation for User Story 2

- [X] T024 [US2] Build src/features/profile/components/font-tiles.tsx (contracts/ui-routes.md; research R6). A 2-column radiogroup of ≥ 56 px tiles, each with "Aa" and the name in `var(--font-<id>)`. Selected: `border-primary` and `bg-accent`. Add "Font · {name}" and the tiles to appearance-view.tsx.
- [X] T025 [US2] Add Text size to appearance-view.tsx with `SegmentedChoice` (Small / Default / Large, each label at its own size; FR-008).
- [X] T026 [US2] Find the sizes that don't scale and fix where Large or Small breaks a screen (research R7). Search src/ for `text-[…px]`, `h-[…px]`, `w-[…px]`, inline `px` font sizes and fixed-height text containers. Change the ones T023 scenario 4 shows overflowing, and list each change in this task.

  (Done 2026-11-24. The only pixel size in src/ outside components/ui was the shift calendar chip, `text-[11px]` in src/features/shifts/components/shift-chip.tsx; it is now `text-[0.6875rem]`, the same 11 px at Default, so it scales with the text (clarification Q1). No inline px font sizes. T023 scenario 4 found no page scrolling sideways at Large: 14 student routes, 20 Admin routes, sign-in and sign-up.)
- [X] T027 [US2] Add `appearance.font` (`"Font · {name}"`), `appearance.textSize`, `appearance.small`, `appearance.default` and `appearance.large` to src/i18n/messages/en.json, my.json and ja.json.
- [X] T028 [US2] Run tests/e2e/us2-fonts.spec.ts (T023) scenarios 1 and 4 with `--grep` on the :3100 build until they pass.

**Checkpoint**: quickstart.md §4 scenarios 5–7 pass by hand.

---

## Phase 5: User Story 3 – The right look from the first frame (Priority: P2)

**Goal**: no flash on any page, signed in or out; a new device gets the account's look at sign-in; a change made elsewhere switches once, then sticks. The browser bar follows the mode.

**Independent Test**: with Dark + Forest + Nunito + Large, reload Today, Courses and sign-in on a throttled connection: the first frame is already dark Forest in large Nunito.

### Tests for User Story 3 (write first, see them fail)

- [X] T029 [P] [US3] Write Playwright tests in tests/e2e/us3-first-paint.spec.ts (390×844 and 1280×800; research R13). An `addInitScript` records every change to `<html>`'s `class`, `data-theme`, `data-font` and `style`, with `performance.now()`, and compares them with the `first-contentful-paint` entry. Cases:
  - **scenario 1**: after choosing Dark + Forest + Nunito + Large, reloading Today and Courses shows no change after FCP, and the attributes match;
  - **scenario 2**: after signing out, sign-in shows the same look before FCP;
  - **scenario 3**: a new context signs in → the first screen after sign-in has the look before FCP;
  - **scenario 5**: `setAppearance` (fixture) changes the profile to Ocean behind the browser's back → the next reload switches exactly once after FCP, and the following reload switches never;
  - **FR-015**: with Dark chosen in a light-scheme browser, `meta[name="theme-color"]` holds `#0c0a09`.

### Implementation for User Story 3

- [X] T030 [US3] Create src/components/shared/appearance-sync.tsx to replace theme-sync.tsx, which is deleted (research R3, R10). Props: the profile's four values. On mount and when they change:
  - compare with `parseAppearanceCookie(document.cookie)`; when they differ, write the cookie, `applyAppearance` and `setTheme(mode)` once;
  - whenever `resolvedTheme` changes, set the `content` of **both** `<meta name="theme-color">` tags (the light-scheme and the dark-scheme one from `viewport.themeColor`) to the resolved mode's background (research R10).

  Render it in src/app/s/layout.tsx and src/app/a/layout.tsx with `me`'s values.
- [X] T031 [US3] Run tests/e2e/us3-first-paint.spec.ts (T029) with `--grep "scenario 1"` and `--grep "scenario 5"` on the :3100 build until they pass. If first paint is late on sign-in or sign-up, check that the cookie is in the action's response before navigation (T012).

  (Done 2026-11-24: scenarios 1, 3, 5 and FR-015 pass on the :3100 build. Two fixes in the test, not the app. First, the recorder observed `document.documentElement`, which doesn't exist yet when an init script runs, so it recorded nothing; it now watches `document` with `subtree`. Second, `chooseLook` navigated while Next was still running the queued saves, and a full page load cancelled them; it now waits for the profile row. On the open after a change elsewhere, AppearanceSync switched at 645 ms with first paint at 648 ms, so the one switch (Q4) landed before anything was painted.)

**Checkpoint**: quickstart.md §4 scenarios 8–10, 12 and 14 pass by hand.

---

## Phase 6: User Story 4 – Mode and language keep working (regression)

**Goal**: 001's Mode and Language behave as before inside the new screen.

**Independent Test**: Light / Dark / Auto switch at once and Auto follows the OS live; English → 日本語 → မြန်မာ translates the Appearance screen and Today's date.

- [X] T032 [P] [US4] Write Playwright tests in tests/e2e/us4-mode-language.spec.ts (390×844 and 1280×800, axe). Cases:
  - **scenario 1**: Light and Dark set `.dark` at once; with Auto, `page.emulateMedia({ colorScheme })` flips it live without a reload;
  - **scenario 2**: Me's language buttons switch the Appearance headings and theme names (e.g. ja), the Me row and Today's date line, and font names stay as written.
- [X] T033 [US4] Run tests/e2e/us4-mode-language.spec.ts (T032) on the :3100 build. Any failure is a regression from Phases 2–5: fix it in the code that caused it.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: docs, translations, the gates, accessibility, screenshots, performance and the status.

- [X] T034 [P] Update the project docs to match what was built (plan.md › Documentation updates):
  - docs/technical-spec.md §11: the `appearance` cookie and pre-paint script instead of server-rendered `data-theme`; accent-only theme blocks (six tokens); `[data-font]` with `--font-active` and no Inter preload; `--font-scale` with the `--spacing` hold; `AppearanceSync` and the theme-color meta;
  - docs/technical-spec.md §3: `lib/appearance.ts`, `app/fonts.ts`, `components/shared/appearance-sync.tsx` and `use-day-period.ts`;
  - docs/data-model.md: the profiles row (the allowed theme, font and scale values) and the CHECK list (`profiles_theme_id_check`, `profiles_font_id_check`, `profiles_font_scale_check`).
- [X] T035 [P] Review every new `my` and `ja` string from 007 for completeness and tone, with no pronouns for students. List the strings that need a native speaker under a `_review` note in specs/007-appearance/quickstart.md, in the format 005 and 006 used (key count, placeholder check, a table of terms).
- [X] T036 Run every gate from the package.json scripts, **one at a time**, after checking that no other session is running tests or a :3100 server:
  1. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`;
  2. `pnpm test`, then `pnpm test:db`;
  3. only after those finish: `pnpm build`, `PORT=3100 pnpm start`, then `PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e`.

  This is the one full Playwright run, covering every feature's specs. Leave :3000 alone and stop :3100 afterwards. Record failures as they are, with the test name and error, and fix the ones 007 caused before ticking the task.

  (Done 2026-11-24. typecheck, lint and format:check clean. `pnpm test`: 67 files, 1737 tests. `pnpm test:db`: 9/9 files. Fresh build (cache cleared) on :3100, full e2e: 277 passed, 1 skipped (us2 scenario 4 on desktop, by design), 2 failed. us2-fonts scenario 2 on both viewports failed because the test navigated while its font save was still queued, so the page opened in Inter. It now waits for the profile row, as the other 007 tests do; scenario 1 got the same wait. Both pass 8/8 across two repeats.)
- [X] T037 [P] Accessibility and layout pass at 390×844 and 1280×800, in Light and Dark, with Indigo, Forest and Mocha, in en, my and ja. Check:
  - swatches, tiles and segments are radios with names and visible focus rings in every theme;
  - the preview card is read as one image;
  - at Large, long Burmese labels wrap instead of truncating where the full label matters (spec Edge Cases);
  - the 44 px targets at Small.

  (Done 2026-11-24, at 390×844 in light/Indigo/Default/en, dark/Mocha/Large/en and dark/Mocha/Large/my. Fixed three overflows, all on Appearance: font names past the tile edge (Merriweather, Hyperlegible) — smaller "Aa", 15 px names, `lang="en"` with hyphens and an anywhere-break fallback; the Burmese "Auto" label past its segment — segment labels may break anywhere; the preview pills overflowing in Burmese — `min-h-11` instead of `h-11`. Theme names now wrap instead of truncating ("Laven…"). Swatches, tiles and segments are radios with names; axe passes in us1/us2/us4; focus rings use the theme ring. 44 px targets at Small checked in us2 scenario 3.)

- [X] T038 Compare /s/me/appearance and /s/me at 390×844 with screenshots/12-Appearance.png and 11-Profile.png. Fix layout, hierarchy and copy, keeping only the differences in contracts/ui-routes.md › Intentional differences.

  (Done 2026-11-24. /s/me/appearance matches 12-Appearance.png: preview, Mode, 2 × 5 swatches, 2-column font tiles with Atkinson and M PLUS on two lines, Text size with labels at their own sizes. Differences are the ones listed: 44 px swatches, and the greeting wraps when it is "Good afternoon". /s/me matches 11-Profile.png: the Appearance row reads "Indigo · Inter · Light" with the swatch.)

- [X] T039 Performance (plan.md › Performance Goals):
  - Lighthouse mobile on /s/today and /s/me/appearance (target ≥ 90);
  - on /s/today, list the font files requested: one Latin family, plus Noto slices only when Japanese or Burmese is on screen (SC-005);
  - time a theme change from tap to repaint in the Performance panel (< 100 ms, no layout shift; SC-001).

  Record the results in specs/007-appearance/quickstart.md §5.

  (Done 2026-11-24, quickstart.md §5. The two Japanese fonts blocked every page's first paint with ~550 KB of CSS (`/s/today` 70 against 80 on main). By the user's choice they now load on demand (src/lib/lazy-fonts, LazyFontLoader, tests in lazy-fonts/index.test.ts and us2-fonts). Appearance's tiles switch to their fonts when idle. Result: `/s/today` 77–84 (main 77–82), Appearance 79–80. A theme change takes 27–40 ms with no layout shift. One font file per page. CLS 0.18 on Today already exists on main.)
- [X] T040 Walk through quickstart.md §4 scenarios 1–15. For each one, record the test that covers it or what wasn't checked.
  - Also check by hand: a lesson's code block keeps a monospace face with every font (FR-006), and, with the network off on a fresh profile, a font that can't download falls back and loads on the next online open (spec Edge Cases).
  - SC-003's 10 throttled reloads are scenario 8 here; the automated T029 reloads without throttling.
  - The installed-app status bar (scenario 14) on a real phone is a manual step for the user: list it as such.

  (Done: quickstart.md §6. Every scenario has an automated test. By hand: code blocks stay monospace. Left: Slow 4G reloads, a few by-eye checks, the font retry after offline (needs 008), and the real phone's status bar (manual, for the user).)
- [X] T041 Set **Status** to `Implemented` in specs/007-appearance/spec.md (constitution quality gate).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none. T001 before T008.
- **Foundational (2)**: after Setup; blocks every story.
  - T008 needs T001, and T003 must fail first.
  - T009 before T010–T014 (they import the lists).
  - T010 → T011 → T012.
  - T013 and T014 after T009.
- **US1 (3)**: after Foundational. Spec US1 scenario 6 for a device that is **already signed in** needs US3's T030; US1 alone covers a new device signing in.
- **US2 (4)**: after US1's T018–T019 (the hook, `SegmentedChoice` and the view). T023 can be written as soon as Foundational is done.
- **US3 (5)**: after Foundational; independent of US1's and US2's screens, except that T029 drives Appearance to choose a look (it can use the `setAppearance` fixture instead).
- **US4 (6)**: after US1 (Mode moved into the new view). T032 can be written at any time.
- **Polish (7)**: after the stories you're shipping. T034, T035 and T037 can run together. T038 follows T037 (same screens). T036 runs after the fixes; T040 and T041 come last.

### Within each story

Tests first and failing → CSS and pure code → hook → components → page → strings → the story's tests pass.

### Shared files (no [P] between these tasks)

- src/app/globals.css: T014 → T017
- src/features/profile/components/appearance-view.tsx: T012 → T019 → T024 → T025
- src/features/profile/schemas.ts / schemas.test.ts: T006 → T010
- src/features/profile/repo.ts / types.ts: T011
- src/app/layout.tsx: T013
- src/app/s/layout.tsx and src/app/a/layout.tsx: T030
- src/i18n/messages/*.json: T021, T027 (one at a time)

### Parallel opportunities

- **Setup**: T002 alongside T001.
- **Foundational**: tests T003–T007 together; then T009, with T008 in parallel (database only); T013 and T014 together after T009.
- **US1**: T015 and T016 together; T017 (CSS) alongside T018 (hook).
- **US2**: T023 alongside US1's implementation; T024 and T026 in parallel (different files).
- **US3**: the whole phase alongside US2, except the message files.
- **US4**: T032 alongside any phase after Foundational.

---

## Parallel Example: Foundational tests

```bash
Task: "pgTAP supabase/tests/007_appearance_checks.test.sql"
Task: "Appearance lists, cookie and script tests src/lib/appearance.test.ts"
Task: "Contrast for 10 themes × 2 modes src/app/theme-contrast.test.ts"
Task: "saveAppearanceSchema tests src/features/profile/schemas.test.ts"
Task: "saveAppearance repo tests src/features/profile/repo.test.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Fixtures tests/e2e/fixtures/appearance.ts"
Task: "Playwright tests/e2e/us1-themes.spec.ts"
# then
Task: "Theme blocks in globals.css" ; Task: "use-appearance.ts hook"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup and Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** with quickstart.md §4 scenarios 1–4: the app has its 10 themes, saved and shared across devices.

### Incremental delivery

1. US1 → themes on every screen (deployable on its own).
2. US2 → fonts and text size.
3. US3 → no flash when the look changed elsewhere, and the browser bar colour. Without it, a change made on another device shows up only after `ThemeSync` (mode) and the sign-in cookie, so ship US3 with or right after US1.
4. US4 → regression tests for Mode and Language.
5. Polish → the gates, screenshots and performance, then Status Implemented.

## Notes

- [P] = different files, no dependency on an unfinished task.
- Commit after each task or logical group, one concern per commit (CLAUDE.md › Focused diffs).
- Field rules cite data-model.md (`Entity.field`); don't copy them into code comments, cite the spec or research decision instead.
- Stop at any checkpoint to validate the story on its own.
