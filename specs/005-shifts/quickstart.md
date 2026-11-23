# Quickstart: Shift Calendar and Availability (005)

How to check 005 end to end. Rules and shapes are in [data-model.md](data-model.md) and [contracts/](contracts/); decisions in [research.md](research.md).

## 1. Prerequisites

- 001–004 merged (`main`), `.env` pointing at the dev Supabase project, `pnpm install` done.
- `CRON_SECRET` set in `.env.local` (002's purge uses it too).
- Linking (001) and course setup aren't needed: tests link students with `linkStudent()` and seed shifts with `seedShift()`.

## 2. Apply and check the database

Before the migration (2026-11-22: 0 patterns, 12 shifts, 0 Off rows with sleep):
```sql
select count(*) from shift_patterns;                                   -- must be 0 (presets column is dropped)
select count(*) from shifts where type = 'off' and sleep_minutes > 0;  -- must be 0 (new CHECK)
```

```bash
pnpm prisma migrate deploy
pnpm prisma generate
pnpm test:db
```
Then:
- `profiles.shift_presets` exists with the default, and `profiles.shifts_confirmed_week` is null;
- `shift_patterns` has `generated_until` and no `presets`;
- an Off shift with `sleep_minutes > 0` is rejected, and a second active rotation for one student is rejected.

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint
pnpm test        # shiftInstants, rotation, calendar chips, timeline, week check, status text;
                 # availability property tests (fast-check); shifts repo; cron top-up
pnpm test:e2e    # us1-shifts, us2-rotation, us3-day, us4-availability (390×844 + 1280×800, axe)
```
Run Playwright against a production build on :3100 (`pnpm build && PORT=3100 pnpm start`, then `PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e`); leave the dev server on :3000 alone.

## 4. Manual scenarios (phone width, 390×844)

Seed: admin Zin (Asia/Yangon) and student May (Asia/Tokyo), linked. May has no shifts.

1. **No shift info (US4 scenario 3)**: Zin's Students card for May says "No shift info"; May's Shifts tab shows the empty state.
2. **Night shift (US1)**: As May, Shifts → Add shift → Night. Times fill 22:00–07:00, Ends shows "+1 day", "9 h · crosses midnight…", Block sleep is on. Save (SC-001: 3 taps: Add shift, Night, Save shift).
   - The calendar shows "22→" on Fri and "→07" on Sat, joined.
   - `select count(*) from shifts where student_id = May` is 1.
   - Repeat on a Sunday: "22→" ends the row and "→07" starts the next row, joined.
3. **Overlap and length (Edge Cases)**: add a Day shift 06:00–10:00 on Sat → "Overlaps your shift Fri 22:00–07:00". A Custom 08:00 → 08:00 (exactly 24 h) saves; for a New York student the same times across the fall-back night (1 Nov 2026) are 25 h and give "A shift can be at most 24 h".
4. **Day timeline (US3)**: select Sat. The bar and list show "00:00–07:00 Night shift (from Fri)", "07:30–15:30 Sleep, auto 8 h", "15:30–23:00 Free to study".
5. **Today banner**: on a day with a night shift ahead, Today shows "Night shift tonight · 22:00–07:00" and "Good window to study now: about … min free".
6. **Admin status (US4 scenario 1)**: during the shift Zin's card says "On night shift until 07:00 · 05:30 yours"; during the sleep block "Sleeping until 15:30 …"; afterwards "Free now". The line changes by itself when the time passes.
7. **Admin Plan (US4 scenario 2)**: Zin's Plan week for May shows the same shift / sleep / free bars (003).
8. **Rotation (US2)**: Shifts → My rotation: D D D O N N O O from next Monday. Save.
   - 8 weeks of shifts appear; Night days have sleep blocks.
   - Edit one generated Day to 10:00–19:00; change the rotation to D D O O: the edited day stays, the other future days follow the new pattern, past days are untouched.
   - Delete one generated shift: the day is Off and stays Off after the cron top-up.
   - A hand-entered shift on a rotation day is kept and that day is skipped ("Kept your own shifts on 1 day").
   - Call `GET /api/cron/rotations` twice with the secret: the second call inserts 0.
9. **Settings (FR-002)**: change Night to 21:00–06:00. Add shift → Night fills 21:00–06:00; the rotation's future Night days move to 21:00; the edited day doesn't.
10. **Sunday check (FR-009)**: with May's clock on Sunday after 18:00 (seed `shifts_confirmed_week` null), Today and Shifts show "Next week's shifts — correct?". Confirm hides it on both, also after reload and on another browser; Edit hides it and opens next Monday.
11. **Time zone (Edge Cases)**: change May's zone to Asia/Yangon: the shift keeps its instants, and the calendar shows 19:30–04:30 (Tokyo is 2 h 30 ahead of Yangon).
12. **Daylight saving**: a New York student's night shift 22:00–07:00 across 1 Nov 2026 shows "10 h".
13. **Languages**: switch to my and ja; all new text is translated; times and dates are formatted per locale.

### Walkthrough (T063, 2026-11-22)

Each scenario against what checks it. Gates on the final build: typecheck, lint and Prettier clean; Vitest 741/741; pgTAP 7/7 files; `pnpm build` passes. Playwright ran one smoke test per story on that build (4/4: US1 scenario 3, US2 scenario 1, US3 scenario 1, US4 scenarios 1 and 3), not the whole suite. The other 005 tests last passed in their own phase, and four have **not** run since they were last changed: `us2-rotation` scenarios 2 and 4, scenario 3 and "a day with the student's own shift", and `us3-day`'s banner test.

1. No shift info: `us4-availability` scenarios 1 and 3 ("No shift info"); the empty state: `us1-shifts` "the empty state invites the first shift". ✓
2. Night shift: `us1-shifts` scenarios 2 and 4 (+1 day, 9 h, Block sleep on) and scenario 3 / SC-001 (three taps, "22→" and "→07" joined, one row). The Sunday → Monday join across the row break: `calendar.test.ts`. ✓
3. Overlap and length: `us1-shifts` Edge Cases (the overlap message); exactly 24 h: `time.test.ts`; the New York fall-back night refused as more than 24 h: `repo.test.ts`. ✓
4. Day timeline: `us3-day` scenario 1 (bar, list, another day without a request), `timeline.test.ts`. ✓
5. Today banner: `repo.test.ts` getTodayBanner (night later today and free until it starts, running shift and the next free time, Off day, a shift that already ended, this week's count). The UI test `us3-day` "Today's banner" is written but was **not** run; the banner was checked on screen at 390×844 (below).
6. Admin status: `us4-availability` scenarios 1 and 3 (both clocks) and "the line changes by itself". ✓
7. Admin Plan: `us4-availability` scenario 2. ✓
8. Rotation: `us2-rotation` scenario 1 (8 weeks, Nights with sleep), scenarios 2 and 4 (edited day kept, deleted day stays Off after the cron, delete removes the rest), "a day with the student's own shift is kept"; the cron twice: `rotation-repo.test.ts` (second run inserts 0) and the 401 test. Scenarios 2 and 4 were fixed in Phase 5 and not run again.
9. Settings: `us1-shifts` "Shift settings: a new Night time fills the next Night shift"; the rotation's future Nights move and the edited day doesn't: `rotation-repo.test.ts`. ✓
10. Sunday check: `us2-rotation` scenario 3 (Today and Shifts, Confirm, reload, another browser, Edit → next Monday), `week-check.test.ts`. Last changed in Phase 5 (server prefetch) and not run since.
11. Time zone: `repo.test.ts` "a new time zone keeps every shift's instants"; the chips in another zone: `calendar.test.ts`. The 19:30–04:30 display wasn't checked by hand.
12. Daylight saving: `time.test.ts` (New York fall-back and spring-forward nights; length from the instants). The editor's "10 h" wasn't checked by hand.
13. Languages: every key exists in en/my/ja (`messages.test.ts`); see `_review` below. Rendering in my and ja was **not** walked through by hand.

## 5. Done means

- The acceptance scenarios of US1–US4 pass in Playwright; the SC-002 property tests pass.
- pgTAP (new checks, RLS read-only for the Admin) and repo tests pass; typecheck and lint are clean.
- Shifts, the editor, Today, Me and Admin Students match their screenshots at 390×844, apart from the parts other features own (contracts/ui-routes.md).
- `docs/data-model.md` and `docs/technical-spec.md` are updated (plan.md › Documentation updates).
- Spec status is updated.

### Screens (T059–T060, 2026-11-22)

Every changed screen captured at 390×844 and 1280×800 (Shifts also in dark mode) and compared with 07-Shifts, 08-ShiftEdit, 04-Today, 11-Profile and 16-AdminStudents. Interactive elements under 44 px were listed automatically. Keyboard: the type tiles are a Radix toggle group (arrow keys), and the calendar is 003's (arrow keys, Home / End). The `--shift-*` pairs are in `theme-contrast.test.ts` (4.5:1, light and dark). Fixed:
- The My rotation row squeezed its label to "M" (390 px) and "My rot…" (desktop), because a settings row's value never shrank. `SettingsRow` values now take at most half the row and truncate; a 28-day rotation fits. The date lost its weekday ("DDDONNOO from Nov 30", as in contracts/ui-routes.md).
- The day list's time column was narrowed, so "Night shift (from Fri)" stays on one line.
- Today's banner keeps "9 h" and "90 min" together (no-break space).

Left as they are:
- The editor's time fields show "10:00 PM" in a US-English browser: they are native `<input type="time">`, which follow the device's 12/24-hour setting. Saved times and every other time in the app are 24-hour.
- The flagged controls under 44 px in the editor (time inputs 36 px tall, radio and checkbox 24–28 px) sit inside tappable cards and rows at least 44 px tall. On Admin Students, the name link (37×21) is 004's whole-card link.
- At 390 px the shift legend wraps under the month name (the screenshot fits both on one row; our month heading is larger).
- The day bar's Shift colour is 003's `--avail-shift` (the theme primary), not the night colour of the screenshot, so it matches the Admin Plan.

### Performance (T061, 2026-11-22)

Measured on `pnpm build && pnpm start` (localhost, dev Supabase over the internet), Lighthouse 12.8.2, mobile, performance only, signed in (the session cookie set in Lighthouse's Chrome through puppeteer, from inside a Playwright test so the test user still exists; the global teardown deletes it afterwards), empty HTTP cache each run, a student with two weeks of shifts and a rotation:

- `/s/shifts`: **88–89** (3 runs; FCP 1.2 s, LCP 3.8–3.9 s, TBT 10–30 ms, CLS 0). **Just below the 90 target.** The LCP element is the month heading. Nearly all of it is waiting for the seeded data: about 10 queries (month, settings, and `/api/shifts/today`, which since US3 includes the banner's busy segments) through a pool of 3 connections at 0.6–2 s per round trip from this machine. With a warm cache it scores 100 (LCP 1.2 s). Options if it matters: stop seeding the today query on Shifts (the Sunday card would then appear after the page), or re-measure on Vercel next to the database, as 004 suggested for `/s/lessons/[id]`.
- `/s/shifts` is one request per month and changing day makes none: `us3-day` scenario 1 records every `/api/` request while switching days (none).
- Saving a rotation is one transaction: `saveRotation` runs in one `prisma.$transaction` (`rotation-repo.ts`).
- `/a/students` adds one statement however many students there are: `admin-repo.test.ts` counts the raw statements for one student and for several (equal).

## _review: strings for a native speaker (T058)

All 128 new keys exist in `my` and `ja`, have the same placeholders as `en` and contain no English. (Burmese and Japanese have no plural forms, so counts are a plain `{count}`.) Each idea uses one term throughout:

| Idea | Burmese | Japanese |
| --- | --- | --- |
| shift | ဆိုင်း | シフト |
| Day / Evening / Night shift | နေ့ / ညနေ / ညဆိုင်း | 日勤 / 遅番 / 夜勤 |
| day off | နားရက် | 休み |
| rotation | အလှည့်ကျဇယား | ローテーション |
| free time | အားချိန် | 空き |
| sleep | အိပ်ချိန် | 睡眠 |
| study | လေ့လာ | 学習 |

Three strings were fixed during this review:
- `shiftSettings.wakingHint` (ja) said 勉強 and now says 学習; the same key (my) said အားလပ်ချိန် and now says အားချိန်.
- `availabilityStatus.onShift` / `onShiftUntil` (my) said "ဆိုင်း ဆင်းနေသည်" and now say "ဆိုင်း ဝင်နေသည်", like Today's `shiftBanner.onShiftUntil`.
- `shifts.sleepAuto` and `shifts.weekShifts` (ja) lost the spaces around the numbers ("自動8時間", "シフト2件").

These strings were written without a native speaker, so please check:

- **Burmese, word choice**:
  - Is "on shift" ဆိုင်းဝင်နေသည် or ဆိုင်းဆင်းနေသည်? Some speakers use ဆိုင်းဆင်း for going off shift.
  - `shiftSettings.wakingTo` "Awake until" is အိပ်ချိန် ("bedtime"), the same word as the Sleep label in the day bar and list.
  - `shifts.types.*` are short forms (နေ့, ညနေ, ည) used on chips and in the legend; are they clear without ဆိုင်း?
  - `rotation.letters.*` show whole words (နေ့, ညနေ, ည, နား) on the pattern tiles instead of letters. Do they fit on a 390 px row of up to 28 tiles?
  - `shiftEditor.blockSleep` "အိပ်ချိန်ကို ပိတ်ထားရန်" ("close off sleep time"): does it read as "keep this time for sleep"?
  - `shiftEditor.cancel` "မလုပ်တော့ပါ" next to `shiftEditor.save` "သိမ်းရန်" in the top bar.
- **Burmese, tone**:
  - The banner lines `shiftBanner.freeNow` / `freeNowHours` use a dash and written style ending in သည်, like 003/004. Is ပါတယ် friendlier for a student?
  - Fixed text uses Burmese digits (`errors.shift_too_long` "၂၄", `rotation.patternHint` "၂၈", `rotation.preview` "၁၄").
- **Japanese, word choice**:
  - Evening is 遅番 ("late shift"). Is 夕勤 or 準夜勤 closer to what shift workers say?
  - Custom is カスタム / カスタムシフト, but on the Admin's card (`availabilityStatus.types.custom`) it is just シフト ("シフト中").
  - `shiftSettings.waking` "起きている時間" and `wakingFrom` / `wakingTo` "起きる時刻" / "寝る時刻": is 活動時間 more natural?
  - `shiftEditor.blockSleep` "睡眠時間を確保" and `sleepUntil` "通知しません" (006 sends the reminders).
  - `shiftEditor.midnight` "0時" vs `stripStart` "{weekday} 0:00".
- **Japanese, tone**:
  - `weekCheck.title` "来週のシフトはこれで合っていますか？" is polite; `availabilityStatus.free` "今は空いています" is too, but the other status lines are plain nouns ("睡眠中・07:00まで").
  - `shiftBanner.freeNow` "今が学習のチャンス：約90分空いています". Is the colon natural on a phone banner, or would a line break be better?
