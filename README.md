# StudyMate — specs and screens

One mobile-first PWA for two roles: **Student** and **Admin**. Stack: **Next.js 16 · Supabase · Prisma 7 · TanStack Query · Tailwind CSS v4 · shadcn/ui** · PWA via Serwist · email via Resend · hosted on Vercel. This folder is ready to drop into the root of a new repo and use with GitHub Spec Kit.

- Plan doc: https://claude.ai/artifact/X2Wn5y1hDqHikddEx5BDhU
- Design canvas (live, clickable): https://claude.ai/artifact/BVa8ZoD5eUMrDwebjsA2jy

## Contents

```
CLAUDE.md                         entry point for Claude Code: what to read, order, rules, commands
.specify/memory/constitution.md   rules every feature follows
docs/technical-spec.md            architecture, structure, auth, data model, RLS, notifications, PWA, theming, testing, deploy
docs/data-model.md                data model: ER diagrams, tables, SQL-only rules, Prisma workflow
prisma/schema.prisma              Prisma models (validated; matches the DB column for column)
prisma/migrations/0_init/         starting SQL: tables + RLS + functions (tested on Postgres 16)
prisma.config.ts                  Prisma 7 config
src/lib/prisma.ts, src/server/auth/guards.ts   Prisma client + authorization guards
specs/001-auth-roles-linking/     sign-up, roles, invite code, approval
specs/002-courses-lessons/        course + lesson CRUD, Markdown, delete safety
specs/003-assign-deadlines/       assign to students, course/lesson deadlines, Plan view
specs/004-progress-assignments/   mark complete, submissions, streaks, Progress
specs/005-shifts/                 shift calendar, overnight shifts, availability
specs/006-notifications/          push, rules, scheduled messages, shift-aware delivery
specs/007-appearance/             10 themes, 10 fonts, dark mode, language
specs/008-pwa-offline/            install, offline cache, sync queue
screenshots/                      29 screens, 2x PNG
```

MVP = 001 → 004 plus the basic part of 006 (push + default rules).

## How to use with Spec Kit

0. Create the app: `pnpm create next-app@latest studymate --ts --tailwind --app --src-dir`, then `pnpm dlx shadcn@latest init`, `supabase init`.
1. `uvx --from git+https://github.com/github/spec-kit.git specify init studymate` and choose Claude Code.
2. Copy `CLAUDE.md`, `.specify/memory/constitution.md`, `specs/`, `docs/`, `prisma/`, `prisma.config.ts`, `src/` and `screenshots/` from this folder into the project. Install `prisma@7 @prisma/client@7 @prisma/adapter-pg pg dotenv`.
3. For each feature in order, on its branch (e.g. `001-auth-roles-linking`):
   - `/speckit.clarify` — answer the `[NEEDS CLARIFICATION]` items
   - `/speckit.plan` — stack and structure are fixed by the constitution and `docs/technical-spec.md`
   - `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement` in small batches
4. When behaviour changes, edit `spec.md` first, then re-plan.

## Open questions (marked in specs)

| Spec | Question |
| --- | --- |
| 001 | One admin per student, or several? |
| 004 | Does a study day follow the local date or the shift day? |
| 005 | Allow shifts longer than 24 h? |
| 006 | May students mute admin rules (up to 7 days)? |

## Screens

| # | File | Role | Screen | Spec |
| --- | --- | --- | --- | --- |
| 01 | 01-Main.png | Student | Sign in (Student selected) | 001 |
| 02 | 02-Signup.png | Student | Create account | 001 |
| 03 | 03-Join.png | Student | Connect to admin (invite code) | 001 |
| 04 | 04-Today.png | Student | Today: shift banner, streak, overdue, due today | 003, 004, 005 |
| 05 | 05-Courses.png | Student | Courses + weekly study chart | 002, 004 |
| 06 | 06-Progress.png | Student | Progress: streak, heatmap, forecast | 004 |
| 07 | 07-Shifts.png | Student | Shift calendar + day timeline | 005 |
| 08 | 08-ShiftEdit.png | Student | Add / edit shift, +1 day, rotation | 005 |
| 09 | 09-Course.png | Student | Course detail, lesson statuses | 002, 003 |
| 10 | 10-Lesson.png | Student | Lesson reader, assignment, mark complete | 002, 004 |
| 11 | 11-Profile.png | Student | Me / settings | 001, 007 |
| 12 | 12-Appearance.png | Both | Theme, font, dark mode, text size | 007 |
| 13 | 13-AdminSignin.png | Admin | Sign in (Admin selected) | 001 |
| 14 | 14-AdminSignup.png | Admin | Create admin account | 001 |
| 15 | 15-AdminWelcome.png | Admin | Welcome: invite code + setup checklist | 001 |
| 16 | 16-AdminStudents.png | Admin | Students, invite code, join request | 001, 004, 005 |
| 17 | 17-AdminCourses.png | Admin | Course list + actions menu | 002 |
| 18 | 18-AdminCourse.png | Admin | Course builder: sections, drag, swipe | 002 |
| 19 | 19-AdminCourseForm.png | Admin | Create / edit course | 002 |
| 20 | 20-AdminLessonEdit.png | Admin | Lesson editor (Markdown) | 002 |
| 21 | 21-AdminDelete.png | Admin | Delete confirmation | 002 |
| 22 | 22-AdminPlan.png | Admin | Plan: availability + deadlines | 003, 005 |
| 23 | 23-AdminAssign.png | Admin | Assign course to students | 003 |
| 24 | 24-AdminNotify.png | Admin | Alerts: scheduled messages + rules | 006 |
| 25 | 25-AdminMessage.png | Admin | Send / schedule message | 006 |
| 26 | 26-AdminRule.png | Admin | Rule builder | 006 |
| 27 | 27-VerifyEmail.png | Both | Confirm email (6-digit code) | 001 |
| 28 | 28-ForgotPassword.png | Both | Forgot password | 001 |
| 29 | 29-ResetPassword.png | Both | Set new password | 001 |

Sample names (May, Thant, Zin) and data in the screens are placeholders.
