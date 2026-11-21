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

## 5. Done means

Acceptance scenarios of US1–US4 pass in Playwright; guard and pgTAP tests pass; typecheck and lint are clean; Assign, Plan, Today, Courses and Course screens match their screenshots at 390×844 (minus the parts owned by 004/005/006, contracts/ui-routes.md); spec status updated.
