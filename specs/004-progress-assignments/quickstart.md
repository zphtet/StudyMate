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

## 5. Done means

- The acceptance scenarios of US1–US4 pass in Playwright.
- Guard and pgTAP tests pass; typecheck and lint are clean.
- Lesson, Progress, Today, Courses, Course, Me and Admin Students match their screenshots at 390×844, apart from the parts other features own (contracts/ui-routes.md).
- `docs/data-model.md` and `docs/technical-spec.md` are updated (plan.md › Documentation updates).
- Spec status is updated.
