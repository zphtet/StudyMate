# Quickstart: Completion, Assignments and Progress (004)

How to check that 004 works end to end. Design details are in [data-model.md](data-model.md) and [contracts/](contracts/).

## 1. Prerequisites

- `.env` points at the **dev** Supabase project (CLAUDE.md), with `DIRECT_URL` set for migrations and `pnpm test:db`.
- The 001–003 migrations are applied. No new packages (research R16). Generate shadcn `tabs` once.
- Test users come from the fixtures (`createConfirmedUser`, `linkStudent`, `seedCourse`, `assignCourse`). The linking UI isn't needed.
- History for the Progress screen is seeded with `markDone` (with a `completedAt`), `seedSession` and `seedSubmission`.
- E2E runs against a production build on port 3100, not the dev server on 3000.

## 2. Apply and check the database

First, check that `select count(*) from study_sessions` returns 0 on `DIRECT_URL`. The new NOT NULL column needs an empty table (data-model.md › Migration).

```bash
pnpm prisma migrate deploy   # applies <timestamp>_progress
pnpm prisma generate
pnpm test:db                 # includes supabase/tests/004_progress_policies.test.sql
```
Expected:
- `study_sessions.planned_minutes` exists, and a row longer than its plan is rejected;
- a second open session for one student is rejected;
- a student can't set their submission to `reviewed`;
- an Admin can't read a Draft or its files;
- `submissions`, `comments` and `lesson_progress` are in `supabase_realtime`.

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint
pnpm test        # streak, forecast, focus, submission-status, completion, heat, lock; guards; progress repo; purge
pnpm test:e2e    # us1-complete, us2-submit, us3-progress, us4-focus (390×844 + 1280×800, axe)
```

## 4. Manual scenarios (phone width, 390×844)

Seed: admin Zin (Yangon) and student May (Tokyo), linked. Course "JLPT N4 Grammar" is Active, in-order unlocking, 20 Published lessons; lesson 13 has an assignment prompt and "submit before complete"; May's course deadline is 31 Dec.

1. **Complete (US1)**: As May, open lesson 1 and tap Mark complete.
   - The bar changes at once to "Done ✓ · Undo · Next lesson".
   - Lesson 2 opens.
   - Courses shows 5 % and "1 of 20".
   - Today's streak reads 1.
2. **Undo**: Undo lesson 1.
   - Progress goes back.
   - Lesson 2 locks again, unless it is done (a done lesson stays open).
3. **Submit before complete**: On lesson 13, tap Mark complete. The Assignment tab opens with the banner and nothing is completed.
4. **Draft and submit (US2)**: Type some text, then wait 2 s.
   - "Draft saved · {time}" appears.
   - Reload: the text is still there.
   - Add 2 photos (one 8 MB from a phone): they are resized; check each stored object is ≤ 2 MB.
   - Submit: the status becomes Submitted and the editor is read-only.
5. **Live admin (SC-002)**: With Zin's `/a/students` already open in a second browser, submit as May.
   - Within 5 s, without a reload, the card shows "1 to review".
   - `notifications` has one `submitted` row for Zin.
6. **Review**: As Zin, open the review screen, write "Check です", then tap Needs redo.
   - May's open lesson screen shows "Needs redo" and the comment within 5 s.
   - May edits and resubmits: Submitted again.
   - Zin marks it Reviewed.
   - Lesson 13 completion and course % never change during this.
   - `notifications` has one `reviewed` row for May, with the latest text, unread.
7. **Notes**: May posts a note and Zin replies. Both see "Notes · 2". A second student linked to Zin doesn't see the thread.
8. **Admin mark done (FR-002)**: Zin marks lesson 14 done for May.
   - May sees "Marked done by Zin".
   - `audit_log` has a `lesson.complete` row with Zin as the actor.
   - Zin taps Reopen and a `lesson.reopen` row is added.
9. **Focus (US4)**: As May, start Focus 15 on lesson 15 and stop it after 2 min: about 2 min is added (lesson and Progress). Then start Focus 25 and close the tab for 30 min.
   - On return, no timer runs and 25 min is counted.
   - Starting another timer closes the old session at its planned end.
10. **Progress (US3)**: Seed 6 active days ending today, with a best run of 9 last month.
    - The Progress Month view shows "6 · Best: 9", shaded days, and "Weekly goal: n of 5 days".
    - The forecast is "On track · finishes ~…, due 31 Dec" or "Behind …", matching the last 14 days.
    - Change May's weekly goal to 3 on Me: the Today and Progress labels follow.
11. **Day boundary**: With May in Tokyo, seed a completion at 23:30 and another at 00:30 local time. They count on two dates and the streak doesn't break.
12. **Languages**: Switch to my and ja. All new text is translated; minutes and dates are formatted per locale.

### Walkthrough (T084, 2026-11-22)

Each scenario against what checks it; all automated checks pass (Playwright 138/138 on the production build, Vitest 614/614, pgTAP 6/6 files).

1. Complete: `us1-complete` scenario 1 (the bar changes before the action answers, Next lesson, Courses "33%" and "1 of 3", the course screen). The streak after a completion: `streak.test.ts`, `us3-progress` (Today). ✓
2. Undo: `us1-complete` scenario 3 and Edge Case (later done lessons stay open), `repo.test.ts` (`not_started` / `in_progress`). ✓
3. Submit before complete: `us1-complete` scenario 2. ✓
4. Draft and submit: `us2-submit` scenario 1 (autosave, reload keeps the text, two photos, each stored object ≤ 2 MB and WebP/JPEG) and scenarios 2–4 (read-only after Submit). The large test photo is just over 2 MB, not an 8 MB phone photo; resizing is in `image.test.ts`. A real phone upload was **not** tried.
5. Live admin (SC-002): `us2-submit` scenarios 2–4 ("1 to review" within 5 s, no reload); the `submitted` notice row: `repo.test.ts`. ✓
6. Review: `us2-submit` scenarios 2–4 (Needs redo arrives live, resubmit, Reviewed, completion and % unchanged); one `reviewed` notice with the latest text, in Japanese: `repo.test.ts`. ✓
7. Notes: `us2-submit` scenario 5 (both see "Notes · 2", another student doesn't see the thread). ✓
8. Admin mark done: `us1-complete` scenario 4 ("Marked done by Zin", `lesson.complete` and `lesson.reopen` audit rows). ✓
9. Focus: `us4-focus` (countdown to 0 adds 15 min; a stop within seconds counts nothing; a timer left 3 h counts 15 min; "Focus running · {lesson}"). Stopping after 2 min, a closed Focus 25 counting 25 min, and a new start closing the old session at its planned end: `repo.test.ts` (focus timer). Not timed by hand in real minutes.
10. Progress: `us3-progress` scenarios 1–2 and the weekly-goal test (streak and best, shaded days, "Weekly goal: n of 5", forecast lines, goal 3 on Me). ✓
11. Day boundary: `repo.test.ts` dailyActivity (Tokyo 23:30 / 00:30 on two dates; New York across daylight saving), `streak.test.ts`. ✓
12. Languages: every key exists in en/my/ja (`messages.test.ts`); see `_review` below. Rendering in my and ja was **not** walked through by hand.

## 5. Done means

- The acceptance scenarios of US1–US4 pass in Playwright.
- Guard and pgTAP tests pass; typecheck and lint are clean.
- Lesson, Progress, Today, Courses, Course, Me and Admin Students match their screenshots at 390×844, apart from the parts other features own (contracts/ui-routes.md).
- `docs/data-model.md` and `docs/technical-spec.md` are updated (plan.md › Documentation updates).
- Spec status is updated.

### Screens (T080–T081, 2026-11-22)

Every changed screen captured at 390×844 (and Lesson, Progress, Today, Courses and the admin screens at 1280×800; Lesson, Progress, Today and Courses in dark mode, with axe) and compared with its screenshot. Fixed:
- Progress: the three stat values stay on one line ("4 h 25 m"); calendar days are rounded squares with the number centred, still 44 px tall (the screenshot's cells are shorter than constitution V allows).
- Today: the two card labels no longer wrap.
- Courses: the card line "12 of 20 · due … · 1 overdue" fits one line.
- Admin Students: tile values on one line at the top, labels wrap instead of truncating; course titles get half the row.
- Lesson review: "Done by {name}" with the time (both clocks) on a second line instead of three wrapped lines.
- The lesson bottom bar: "Focus running" and the lesson name on two lines, so Mark complete keeps its label.
- The axe check now waits for finite animations, so a sheet still fading in isn't read as low contrast.

Left as they are:
- Dates read "Dec 31" where the screenshots say "31 Dec": the whole app uses the `en` (US) locale formats, as in 003. Switching to `en-GB` is an app-wide choice, not a 004 one.
- Today's Continue title is "Lesson {n} · {lesson}"; the screenshot's "{course short} · Lesson {n}" needs a short course name, which courses don't have.
- Admin course rows truncate long titles ("JLPT N4 Gramm…"); the screenshot uses short names.
- Card corners stay `rounded-3xl` as everywhere else in the app (the screenshots are tighter).
- On a slow connection the Focus button is disabled for a moment until `GET /api/focus` answers.
- Heat-level contrast is checked in every theme and mode by `src/app/theme-contrast.test.ts`.

### Performance (T082, 2026-11-22)

Measured on `pnpm build && pnpm start` (localhost, dev Supabase over the internet), Lighthouse 12.8.2, mobile, performance only, signed in (session cookie passed with `--extra-headers`), 2–3 runs each:

- `/s/progress`: **90–92** (FCP 1.2 s, LCP 3.3–3.5 s, TBT 10–20 ms, CLS 0). Target met.
- `/s/lessons/[id]`: **86–87** (FCP 1.2 s, LCP 3.8–3.9 s, TBT 30–70 ms, CLS 0). **Below the 90 target.** It was 84–85 (LCP 4.4 s). The LCP is the header line "{course} · Lesson n of m"; nearly all of it is render delay. Done: supabase-js (the largest unused script, used only by Realtime and photo uploads) now loads after the first paint in `lib/realtime.ts` and `progress/upload.ts`. Tried and dropped: reading the lesson's work alongside 002's lesson read instead of after it (no change). Left: 002's Markdown renderer (~26 KiB unused) and zod for the form schemas (~24 KiB unused). Worth re-measuring on Vercel next to the database, as for 003's `/a/plan`.
- `MdTextarea` is not in the lesson page's first-load JS: none of the first-load chunks contains the editor; two chunks load when the Assignment tab opens (checked with a Playwright response log).
- `/a/students`: 6 SQL statements for 1 linked student and for 10 (Prisma query log), so no N+1.
- `/s/progress`: one request, 3 SQL statements (weekly goal, the grouped daily activity, courses with `course_progress`). The plan's "two grouped queries plus `course_progress`" counts the weekly-goal read as part of the profile.

## _review: strings for a native speaker (T079)

Every `my` and `ja` string added in 004 exists, has the same placeholders as `en` and no English left (except shared formats such as `{percent}%`, `{count} / {max}` and `{a} · {b}`; Burmese and Japanese have no plural forms, so most counts are a plain `{count}`). Terms from 003 are kept: deadline = နောက်ဆုံးရက် / 期限, overdue = ရက်လွန် / 期限切れ, course = သင်ခန်းစာအစုံ / コース. 004 uses one word per idea: assignment = လေ့ကျင့်ခန်း / 課題, submit = တင်သွင်း / 提出, review = စစ်ဆေး / 確認, needs redo = ပြန်လုပ်ရန် / やり直し, draft = မူကြမ်း / 下書き, notes = မှတ်စု / ノート, focus = အာရုံစိုက် / 集中, streak = ဆက်တိုက် လေ့လာ / 連続学習, progress = တိုးတက်မှု / 進捗, weekly goal = အပတ်စဉ် ပန်းတိုင် / 週の目標. Two were fixed during this review: `progress.forecastTitle` (my) used သင်တန်း and now says သင်ခန်းစာအစုံ, and `courses.progress` (ja) said "進み具合" and now says "進捗" like the Progress tab. They were written without a native speaker, so please check:

- **Burmese, word choice**: course is still two words in the app: 001/002 (`nav.courses`, `courses.title`, `lessonView.back`) say သင်တန်း, 003/004 say သင်ခန်းစာအစုံ, so the Progress heading `progress.forecastTitle` "သင်ခန်းစာအစုံများ · ပြီးဆုံးမည့် ခန့်မှန်းချက်" no longer matches the Courses tab "သင်တန်းများ" (pick one, and is the heading too long at 390 px?). `notes.thread` "မှတ်စုများ" for a thread with the teacher (or something closer to "messages"?). `submission.feedback` "အကြံပြုချက်" (student side) vs `adminStudents.commentLabel` "{name} အတွက် မှတ်ချက်" (admin side) for the same comment. `progress.best` "အများဆုံး- {count}" (vs အကောင်းဆုံး). `lessonWork.focus.start` "အာရုံစိုက် {minutes}" as a button, and `lessonWork.focus.finished` "… {minutes} မိနစ် ထည့်ပြီး" (or မှတ်ပြီး?). `progress.forecast.on_track` / `behind` "~{finish}" (would "{finish} ခန့်" read better?). `adminStudents.doneBy` "ပြီးပြီ · {name}" drops the "by" (`{name} က`?). `submission.redoNoName` "သင့်အက်ဒမင်က" (to a student, ဆရာ?).
- **Burmese, tone**: student-facing `notifications.reviewedBody` / `needsRedoBody`, `submission.redo` and `progress.dayNone` / `forecast.no_pace` "မလေ့လာရ" (does ရ sound like "couldn't study"?) are in written style ending in သည်, like 003; is ပါတယ် friendlier? Button length: `lessonWork.markComplete` / `adminStudents.markDone` "ပြီးဆုံးကြောင်း မှတ်ရန်" next to Undo/Next on a 390 px bottom bar. Fixed text uses Burmese digits (`errors.too_many_images` "၅", `validation.commentTooLong` "၂၀၀၀", `forecast.no_pace` "၂ ပတ်") to match the locale's number format, but `submission.tooLong` keeps "200 KB".
- **Japanese, word choice**: Notes is "ノート" in `lessonWork.tabs.notes` and `notes.*`, but `notes.emptyStudent` / `emptyStudentNoAdmin` say "質問やメモ" and 002's `courseForm.allowNotes` says "個人メモ" (use メモ or コメント throughout?). `progress.forecast.on_track` "順調 · ~{finish}に修了予定" and `behind` "このペースだと~{finish}": "~" can read as "until" in Japanese, so "{finish}頃" may be clearer. `courses.doneOf` "{total}中{done}" and `todayProgress.continueCourse` "{total}中{done}完了" (vs "{done}/{total}"). `lessonWork.focus.start` "集中 {minutes}" (vs "集中{minutes}分"), `lessonWork.focus.runningNow` "集中タイマー作動中". `adminStudents.back` "学生一覧に戻る" follows `students.title` "学生", while 002/003 say 生徒 for students. `submission.redoNoName` "管理者が" (先生 to a student?). `progress.best` "最高: {count}" (vs 最長).
- **Japanese, tone**: さん is written two ways: "{name} さん" with a space in `notifications.*`, `submission.redo`, `notes.empty*`, `adminStudents.commentLabel` (003 style), and "{name}さん" without one in `lessonWork.markedDoneBy`, `adminStudents.backToStudent`, `lessonPosition`, `noSubmission`; `adminStudents.doneBy` "完了 · {name}" has none (the name can be the admin's own). The review buttons are uneven: `adminStudents.reviewed` "確認済みにする" is a verb, `adminStudents.needsRedo` "やり直し" is not ("やり直しを依頼"?). Length of `courses.lessonsDoneOf` "{total}レッスン中{done}レッスン完了" on a course card.
