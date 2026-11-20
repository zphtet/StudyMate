# Implementation Plan: Accounts, Roles and Admin Linking

**Branch**: `001-auth-roles-linking` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-auth-roles-linking/spec.md` (clarified 2026-11-20: one admin per student; email sign-in only; live in-app link updates; invite codes valid until regenerated; initials avatars).

## Summary

Email + password accounts with a role chosen once (student or admin), 6-digit email confirmation, password reset by code, admin invite codes, and the join → approve/decline → leave/remove link lifecycle with live updates. Built on the existing `0_init` schema: Supabase Auth for identity (`@supabase/ssr`), Prisma behind guards for all table access, TanStack Query for reads through Route Handlers, Server Actions for writes. The feature adds one server-only table (`auth_email_limits`) for code attempts and resend limits, puts `student_links` on Realtime, and builds the student and admin app shells that later features fill.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9 (local 24.5)

**Primary Dependencies**: Next.js 16.4 (App Router, `src/proxy.ts`), React 19.3, `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.119, Prisma 7.10 (`@prisma/adapter-pg`), Tailwind CSS 4.3, shadcn/ui (Radix, Nova). **To add**: `@tanstack/react-query` (+ devtools), `next-intl`, `next-themes`, `react-hook-form`, `zod`, `@hookform/resolvers`, `qrcode` (+ `@types/qrcode`), shadcn components (input, input-otp, label, card, dialog, alert-dialog, sheet, dropdown-menu, separator, badge, skeleton, sonner, command, popover)

**Storage**: Supabase Postgres 17 (dev project) via Prisma; Supabase Auth; Realtime on `student_links`; Storage unused in 001

**Testing**: pgTAP via `pnpm test:db`; Vitest (unit + guard tests against the dev database); Playwright at 390×844 and 1280×800 with `@axe-core/playwright`; Supabase admin API in e2e helpers for codes and fixtures (research R5)

**Target Platform**: Mobile browsers first (iOS Safari 16.4+, Android Chrome), desktop browsers; deployed on Vercel

**Project Type**: Web application (single Next.js app, PWA later in 008)

**Performance Goals**: student signs up and sends a join request in < 2 min on a phone (SC-001); approve → student inside the app within 5 s (SC-003); Lighthouse performance ≥ 90 on a mid-range phone profile (constitution quality gate)

**Constraints**: no Docker or local Supabase (all DB work against the dev project); Supabase custom-SMTP email rate limit keeps the number of email-sending e2e tests small; FR-011 limits (5 attempts per code, 60 s / 5 per hour resend); never reveal whether an email has an account

**Scale/Scope**: up to hundreds of students and dozens of admins at first; 9 screens from the spec plus 7 placeholder tabs; 3 languages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How 001 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below; every Route Handler and Server Action starts with a guard (except the public auth actions, justified under Complexity Tracking); RLS already on `profiles`, `admin_invites`, `student_links`; new table has RLS with no policies; students see only themselves and their admin, admins only linked students | ✅ | ✅ |
| II. Spec first | Spec clarified (5 answers recorded); the one decision the spec doesn't cover (withdrawing an older pending request) is listed in data-model.md for approval | ✅ | ✅ |
| III. Test-first | pgTAP for the migration and link/profile policies; Vitest for limit rules, invite codes, schemas and every guard (written before the code); Playwright spec per user story at 390×844 | ✅ | ✅ |
| IV. Time | Timestamps stored UTC; timezone detected at sign-up and editable; relative times ("Requested 10 min ago") formatted in the viewer's zone by next-intl | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | Designed at 390 px; 44 px targets; labelled inputs; `aria-label` on icon buttons; theme tokens only. Only the default indigo theme (light + dark) exists in 001; the other 9 themes and their contrast test come with 007 | ✅ | ✅ |
| VI. Three languages | All strings in `en`/`my`/`ja` from the first commit; Noto Sans JP + Myanmar fallbacks; Burmese and Japanese drafts flagged for native review | ✅ | ✅ |
| VII. Stack | Only stack libraries plus `qrcode` (tiny, renders the invite QR); supabase-js used only for Auth (including the admin API for deletion) and Realtime; Prisma for all tables | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db; build; screenshots matched | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| Sign up, confirm email, sign in, reset password | ✓ | ✓ | public auth actions |
| Read and edit own profile, export, delete account | ✓ | ✓ | `requireUser` |
| Preview an invite code | ✓ | – | `requireRole('student')` |
| Send / withdraw a join request, leave admin | ✓ | – | `requireRole('student')` |
| See own invite code, regenerate it | – | ✓ | `requireRole('admin')` |
| See join requests and linked students | – | own only | `requireRole('admin')` + `adminId` in `where` |
| Approve / decline a request, remove a student | – | own only | `requireRole('admin')` + link's `adminId` = caller |

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-roles-linking/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R14
├── data-model.md        # entities, link lifecycle, new table, migration
├── quickstart.md        # prerequisites, commands, manual scenarios
├── contracts/
│   ├── route-handlers.md
│   ├── server-actions.md
│   └── ui-routes.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── proxy.ts                       # session refresh, optimistic role routing, x-pathname (R1)
├── app/
│   ├── layout.tsx                 # fonts, ThemeProvider, NextIntlClientProvider, QueryProvider, Toaster
│   ├── globals.css                # indigo tokens, light + dark
│   ├── (auth)/sign-in · sign-up · verify-email · forgot-password · reset-password /page.tsx
│   ├── auth/callback/route.ts
│   ├── join/page.tsx · join/[code]/page.tsx
│   ├── s/layout.tsx               # role + active-link check, student bottom nav
│   │   └── today · courses · progress · shifts · me · me/account /page.tsx
│   ├── a/layout.tsx               # role check, admin bottom nav
│   │   └── welcome · students · courses · plan · alerts · me · me/account /page.tsx
│   └── api/me · me/export · invites/preview · admin/students · admin/overview /route.ts
├── features/
│   ├── auth/       actions.ts · schemas.ts · limits.ts (pure rules) · limits-repo.ts · components/
│   ├── links/      actions.ts · repo.ts · queries.ts · schemas.ts · use-link-realtime.ts · components/
│   ├── invites/    actions.ts · repo.ts · code.ts · components/ (InviteCard, QrDialog)
│   ├── profile/    actions.ts · repo.ts · queries.ts · schemas.ts · components/
│   └── admin/      repo.ts · queries.ts · components/ (WelcomeChecklist, StudentCard, RequestCard)
├── components/
│   ├── ui/                        # shadcn
│   ├── layout/                    # BottomNav, PageHeader, AuthShell
│   └── shared/                    # InitialAvatar, EmptyState, CodeInput, PasswordChecks, TimezonePicker, LanguageSwitcher
├── lib/
│   ├── prisma.ts · utils.ts
│   ├── supabase/ server.ts · client.ts
│   ├── query/ client.ts · server.ts · provider.tsx
│   └── http.ts (handle) · action.ts (action, publicAction, unwrap) · api.ts (typed fetch)
├── server/
│   ├── auth/guards.ts (+ guards.test.ts)
│   └── supabase-admin.ts          # server-only admin API client (SUPABASE_SECRET_KEY)
└── i18n/ request.ts · locales.ts · messages/{en,my,ja}.json

prisma/
├── schema.prisma                  # + AuthEmailLimit
└── migrations/<UTC timestamp>_auth_email_limits_realtime/migration.sql

supabase/tests/
├── 001_auth_email_limits.test.sql
└── 001_link_policies.test.sql

tests/e2e/
├── fixtures/ (supabase-admin.ts, users.ts, codes.ts)
├── global-teardown.ts
└── us1-signup-roles · us2-join-approve · us3-profile-account · us4-confirm-email · us5-reset-password .spec.ts
```

**Structure Decision**: Single Next.js app following `docs/technical-spec.md` §3, one folder per feature under `src/features`. Unit and guard tests sit next to the code (`*.test.ts`, matching `vitest.config.mts`); pgTAP in `supabase/tests`; Playwright in `tests/e2e`. The scaffold's `src/app/page.tsx` is removed because the proxy redirects `/`.

**Documentation updates in this feature**: `.env.example` and technical spec §15 gain `SUPABASE_SECRET_KEY` (server-only); technical spec §5 notes that join/approve run in Prisma rather than the SQL RPCs (research R2); `vitest.config.mts` maps `server-only` to an empty module so guards can be tested.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Public auth Server Actions (`signUp`, `verifyEmailCode`, `resendSignupCode`, `signIn`, `requestPasswordReset`, `resetPassword`, `setLocale`) don't call a guard | No user exists yet when signing up, confirming or resetting | A guard can't apply before authentication. Mitigation: Zod on every input; they touch only Supabase Auth and `auth_email_limits` (keyed by the submitted email); responses never reveal whether an account exists; all live in `src/features/auth/actions.ts` behind a `publicAction()` wrapper so reviews can spot them |
| Server-only Supabase secret key (`SUPABASE_SECRET_KEY`) | Account deletion must remove the auth user and its sessions (research R6); e2e needs codes and fixture users (R5) | Raw SQL delete isn't endorsed by Supabase and leaves sessions valid; reading codes from the DB is impossible (hashed). Mitigation: one `server-only` module, never `NEXT_PUBLIC_`, used by `deleteAccount` and test helpers only |
| Join/approve logic duplicated in Prisma while `request_join`/`respond_join` stay in SQL | The RPCs depend on `auth.uid()`, which is null on Prisma's connection (R2) | Calling them via supabase-js breaks the "supabase-js only for Auth, Storage, Realtime" rule. The SQL copies stay because SQL-only objects are never dropped; a later migration may remove them once nothing needs them |
