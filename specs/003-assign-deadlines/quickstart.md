# Quickstart: Assigning Courses and Deadlines (003)

How to check 003 works end to end. Design details: [data-model.md](data-model.md), [contracts/](contracts/).

## 1. Prerequisites

- `.env` points at the **dev** Supabase project (CLAUDE.md); `DIRECT_URL` set for migrations and `pnpm test:db`.
- 002 migrations applied; `pnpm install` after `date-fns` and `@date-fns/tz` are added (research R14).
- Test users from the 001/002 fixtures. Linking UI (001 US2) is **not** required: tests link students with `linkStudent()`.
- Shifts (005) and completions (004) are seeded by fixtures (`seedShift`, `markDone`).

## 2. Apply and check the database

```bash
pnpm prisma migrate deploy   # applies <timestamp>_assign_deadlines to DIRECT_URL
pnpm prisma generate
pnpm test:db                 # includes supabase/tests/003_assign_policies.test.sql
```
Expected: `lesson_deadlines_student_due` and `notification_rules_default_once` exist; `deadlines_write` denies a lesson outside the admin's courses and a lesson without an active assignment.

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint
pnpm test        # lib/time, lib/availability, assignments/status, schemas, guards, repos
pnpm test:e2e    # us1-assign, us2-deadlines, us3-student-due, us4-plan (390×844 + 1280×800, axe)
```

## 4. Manual scenarios (phone width, 390×844)

Seed: admin Zin (Yangon), students May (Tokyo) and Thant (Yangon), linked; course "JLPT N4 Grammar" Active with target date 31 Dec and ≥ 5 Published lessons.

1. **Assign (US1)**. As Zin open the course → Assign. Both students are listed with Tokyo/Yangon; Due pre-fills "31 Dec 2026, 23:59" (target date). Clear Thant's Due to "No deadline", tick "Notify students now", tap "Assign to 2 students". → May's Courses shows "due 31 Dec"; Thant's shows "no deadline". `notifications` has one `assigned` row per student; `notification_rules` has 4 `preset: default` rows per student.
2. **Assign again** with May's Due changed → no duplicate assignment; one `deadline` notice row for May (unread). Change it twice more → still one row, latest text.
3. **Lesson deadline (US2)**. Plan → May → "+ Deadline" → the course → lesson 13 → yesterday 20:00. → "Already overdue" warning; save. May's course screen: lesson 13 red "1 day late", "was due …"; other lessons "Due 31 Dec" (grey).
4. **Status colours (US3)**. Set lesson 14 to today 21:00 (May's time) → amber "Due today · 21:00 tonight"; seed `markDone` for lesson 12 with a deadline → green "Done". May's Today: "Overdue · 1" then "Due today".
5. **Plan clash (US4)**. Seed a night shift for May Fri 22:00–Sat 07:00 (sleep 8 h). Set a deadline Fri 23:00 → card says "May is on shift then" + "Move to Sat …"; tap → moved, notice recorded.
6. **Drag and keyboard**. Long-press a card, drop on another day → same local time on the new day. Repeat with keyboard (Space, ↓, Space).
7. **Unassign**. Untick Thant → confirm dialog → Thant no longer sees the course; reassign → progress and lesson deadlines are back.
8. **Hidden lesson**. Delete lesson 13 (002) → it leaves May's Today and Plan; restore → it comes back with its deadline.
9. **Time zones**. Switch Zin to Asia/Tokyo and back → May's deadlines keep their moment; `TimeBoth` shows both clocks.
10. **Languages**. Switch to my and ja → all new text translated; Burmese and Japanese render correctly in chips and the Plan.

### Walkthrough (T068, 2026-11-22)

Each scenario against what checks it; all automated checks pass (Playwright 106/106 on the production build).

1. Assign: `us1-assign` scenarios 1–3 and 6–8 (notices, 4 default rules, notify now). ✓
2. Assign again: `repo.test.ts` (no duplicate assignment, one `deadline` notice row with the latest text). ✓
3. Lesson deadline: `us2-deadlines` scenario 3 (Already overdue, Later than the course deadline), `us3-student-due` scenarios 2–3. ✓
4. Status colours: `us3-student-due` scenarios 1–3 and `student-repo.test.ts`. ✓
5. Plan clash: `us4-plan` scenario 2 (shift, sleep, quiet hours, Move with notice). ✓
6. Drag and keyboard: `us2-deadlines` scenario 4 (pointer and Space/↓/Space keep the local time). ✓
7. Unassign: `us1-assign` scenarios 4–5 (confirm, unassign); reassign restoring progress and deadlines: `repo.test.ts`. ✓
8. Hidden lesson: `student-repo.test.ts` (left out while deleted, back when restored), `us3-student-due`; on the Plan the same filter is in `getPlanWeek` (published, not deleted) but has no e2e test of its own.
9. Time zones: stored as instants (`time.test.ts`, `status.test.ts`), both clocks on every admin surface (`us1`, `us2`, `us4` "· … yours"). Switching the admin's own zone and back was **not** walked through by hand.
10. Languages: every key exists in en/my/ja (`messages.test.ts`), see `_review` below. Rendering in my and ja was **not** walked through by hand.

## 5. Done means

Acceptance scenarios of US1–US4 pass in Playwright; guard and pgTAP tests pass; typecheck and lint are clean; Assign, Plan, Today, Courses and Course screens match their screenshots at 390×844 (minus the parts owned by 004/005/006, contracts/ui-routes.md); spec status updated.

### Performance (T066, 2026-11-22)

Measured on `pnpm build && pnpm start` (localhost, dev Supabase over the internet), Lighthouse 12.8.2, mobile, performance only, signed in (session cookie passed with `--extra-headers`), 2–3 runs each:

- `/s/today`: **91–92** (FCP 1.2 s, LCP 3.4 s, TBT 20 ms, CLS 0). Target met.
- `/a/plan`: **87–88** (FCP 1.2 s, LCP 3.9 s, TBT 30–60 ms, CLS 0). **Below the 90 target.** For comparison, 001's `/a/students` scores 90 (LCP 3.6 s) in the same setup. The LCP is a card title in the streamed week; nearly all of it is render delay. Done: the Deadline sheet loads on first tap; the Plan URL checks no longer pull zod into the browser (unused JS 51 → 26 KiB, the rest is the shared framework chunk); the page seed reuses the student row it already has (one database round trip fewer). Left: `@dnd-kit` (~45 KiB) loads with the week; lazy-loading it would mean a static week first and a draggable one later. Worth re-measuring on Vercel next to the database before deciding.
- The Plan week is one server render per week (the URL drives it; no `/api/admin/plan` call from the page) with one `busy_segments` call (`getPlanWeek`, covered by `plan-repo.test.ts`).
- `@dnd-kit` is only in the client bundles of `/a/plan` and `/a/courses/[courseId]` (002's lesson reorder), checked in the build's client reference manifests.

## _review: strings for a native speaker (T063)

Every `my` and `ja` string added in 003 exists, has no English left (except shared formats such as `{number} · {title}` and `{kind} {from}–{to}`), and uses one word per idea: deadline = နောက်ဆုံးရက် / 期限, late = ရက်လွန် / 期限切れ, shift = အလုပ်ဆိုင်း / シフト, course = သင်ခန်းစာအစုံ / コース. They were written without a native speaker, so please check:

- **Burmese, word choice**: `plan.title` "အစီအစဉ်" (Plan tab), `dayBar.sleep` "အိပ်ချိန်" / `dayBar.free` "အားချိန်", `deadlines.timeCompact` "{primary} · သင့်အချိန် {secondary}" (the admin's own time), `assign.unlockInOrder` "အစဉ်လိုက် ဖွင့်ရန်", `plan.target` "နောက်ဆုံးရက် သတ်မှတ်ရန်" (label of the lesson picker).
- **Burmese, tone**: the student-facing `notices.*` and `reminders.default.*` (polite but not stiff?), `today.greeting`.
- **Japanese, word choice**: `plan.title` "計画" (vs 予定), `assign.defaultReminders` "標準のリマインダー", "連携している生徒" for linked students, `deadlines.timeCompact` "あなたの時間".
- **Japanese, tone**: `notices.*` and `reminders.default.*` (です/ます, さん after names), `deadlines.alreadyOverdue` "すでに期限を過ぎています" length in the sheet.
