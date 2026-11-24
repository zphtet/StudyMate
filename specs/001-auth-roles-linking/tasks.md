---
description: "Tasks for 001 Accounts, Roles and Admin Linking"
---

# Tasks: Accounts, Roles and Admin Linking

**Input**: Design documents from `specs/001-auth-roles-linking/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md (clarified 2026-11-20)

**Tests**: Required. Constitution III (test-first): pgTAP for database rules, Vitest for logic and guards (written and failing before the code), Playwright per user story at 390×844 and 1280×800.

**Organization**: Grouped by user story. Story order follows dependencies: US1 → US4 → US2 → US5 → US3 (all P1 except US3, P2). US1's sign-up only reaches the role home once US4's confirmation exists, so US1 and US4 together form the first deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md
- Paths follow plan.md "Project Structure"; field rules cite `data-model.md` (`Entity.field`) instead of repeating them

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, config, environment

- [X] T001 Add runtime dependencies `@tanstack/react-query next-intl next-themes react-hook-form zod @hookform/resolvers qrcode` and dev dependencies `@tanstack/react-query-devtools @types/qrcode` to package.json with `pnpm add` (lockfile updated)
- [X] T002 [P] Add shadcn components input, input-otp, label, card, dialog, alert-dialog, sheet, dropdown-menu, separator, badge, skeleton, sonner, command, popover into src/components/ui/ with `pnpm dlx shadcn@latest add …`
- [X] T003 [P] Map `server-only` to an empty stub for tests: create tests/stubs/server-only.ts and add a `resolve.alias` entry in vitest.config.mts
- [X] T004 [P] Add `SUPABASE_SECRET_KEY` (server-only, never `NEXT_PUBLIC_`) to .env.example and docs/technical-spec.md §15; note in docs/technical-spec.md §5 that join/approve/decline run in Prisma repos behind guards, not the `request_join`/`respond_join` RPCs (research.md R2)
- [ ] T005 Manual (project owner): apply the dev Supabase dashboard settings and add `SUPABASE_SECRET_KEY` to `.env` as listed in specs/001-auth-roles-linking/quickstart.md §1; confirm when done

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: database change, auth plumbing, data-fetching and i18n setup, app shells, e2e fixtures. Every story depends on this phase.

**⚠️ CRITICAL**: no user story work starts until this phase is complete

### Tests first (write, run, see them fail where the code doesn't exist yet)

- [X] T006 [P] pgTAP tests in supabase/tests/001_auth_email_limits.test.sql: table `auth_email_limits` exists with RLS enabled; `anon` and `authenticated` cannot select/insert/update/delete; CHECK rejects an unknown `purpose` (data-model.md AuthEmailLimit.purpose) and negative counters (AuthEmailLimit.sendsInWindow, AuthEmailLimit.failedAttempts); `public.student_links` is in publication `supabase_realtime`. Wrap in `begin … rollback`
- [X] T007 [P] pgTAP policy tests in supabase/tests/001_link_policies.test.sql for existing `0_init` policies (SC-002): a student reads own profile and own links and their linked admin's profile, not another student's; an admin reads linked students' profiles and own links/invites only; an unlinked admin reads nothing; a student cannot set `student_links.status` to anything but `removed` (data-model.md StudentLink.status); `profiles.role` cannot change (data-model.md Profile.role)
- [X] T008 [P] Guard tests in src/server/auth/guards.test.ts with `@/lib/supabase/server` mocked to return a chosen user and fixture rows created through Prisma/`$executeRaw` in the dev database (cleaned up afterwards): `requireUser` (none → 401, unconfirmed → 403, no profile → 403), `requireRole`, `requireAdminOf` (active link only), `requireSelfOrAdminOf`, `requireCourseOwner`, `requireCourseReader`, each allowed and denied (SC-002)
- [X] T009 [P] Unit tests in src/features/auth/limits.test.ts for the rules table in data-model.md (AuthEmailLimit.lastSentAt cooldown, AuthEmailLimit.sendsInWindow within AuthEmailLimit.windowStartedAt, AuthEmailLimit.failedAttempts, window restart, success clears the row)
- [X] T010 [P] Unit test in src/i18n/messages.test.ts: every key in src/i18n/messages/en.json exists in my.json and ja.json and vice versa

### Implementation

- [X] T011 Add model `AuthEmailLimit` to prisma/schema.prisma (fields and mapping per data-model.md AuthEmailLimit.email, .purpose, .windowStartedAt, .sendsInWindow, .lastSentAt, .failedAttempts, .updatedAt; `@@id([email, purpose])`, `@@map("auth_email_limits")`); generate prisma/migrations/<UTC timestamp>_auth_email_limits_realtime/migration.sql with the docs/data-model.md §7 diff; append CHECK constraints, `enable row level security`, `revoke all … from anon, authenticated`, and `alter publication supabase_realtime add table public.student_links`; run `pnpm prisma migrate deploy` and `pnpm prisma generate`; T006 passes
- [X] T012 [P] Implement the pure limit rules in src/features/auth/limits.ts (decide send/verify outcome from a row and `now`, per data-model.md AuthEmailLimit.lastSentAt, .sendsInWindow, .windowStartedAt, .failedAttempts); T009 passes
- [X] T013 Implement src/features/auth/limits-repo.ts (`import 'server-only'`): read, upsert and delete rows by normalised data-model.md AuthEmailLimit.email + AuthEmailLimit.purpose; delete rows older than 24 h (AuthEmailLimit.updatedAt) for the same email on write
- [X] T014 [P] Browser Supabase client in src/lib/supabase/client.ts (`createBrowserClient` with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; Auth and Realtime only)
- [X] T015 [P] Server-only admin client in src/server/supabase-admin.ts (`import 'server-only'`, `SUPABASE_SECRET_KEY`, `auth: { persistSession: false }`), exporting `deleteAuthUser(id)` (research.md R6)
- [X] T016 [P] Request/response helpers: `handle()` in src/lib/http.ts (AuthError → 401/403/404, ZodError → 400, JSON error shape from contracts/route-handlers.md); `action()`, `publicAction()` and `unwrap()` with the `Result` type from contracts/server-actions.md in src/lib/action.ts; typed `api()` fetch in src/lib/api.ts
- [X] T017 [P] TanStack Query: `makeQueryClient` (staleTime 30 s, gcTime 24 h, retry 2) in src/lib/query/client.ts, `getQueryClient` with React `cache()` in src/lib/query/server.ts, `QueryProvider` with devtools in development in src/lib/query/provider.tsx
- [X] T018 [P] i18n: supported locales and `hasLocale` in src/i18n/locales.ts (data-model.md Profile.locale); src/i18n/request.ts reads the `locale` cookie, then `Accept-Language`, then `en` (research.md R8); add the next-intl plugin to next.config.ts; create src/i18n/messages/{en,my,ja}.json with `common`, `nav`, `errors` (one key per error code in contracts/server-actions.md); T010 passes
- [X] T019 Root layout and theme: first write src/app/theme-contrast.test.ts (every text/background token pair in globals.css reaches 4.5:1 in light and dark, constitution V) and see it fail; indigo light/dark tokens in src/app/globals.css (shadcn variables, research.md R9) until it passes; src/app/layout.tsx loads Inter, Noto Sans JP and Noto Sans Myanmar via `next/font`, wraps in ThemeProvider (`attribute="class"`, `defaultTheme="system"`), NextIntlClientProvider, QueryProvider and Toaster; delete src/app/page.tsx (proxy handles `/`)
- [X] T020 Proxy in src/proxy.ts following the table in contracts/ui-routes.md: new `@supabase/ssr` server client per request, `getClaims()`, route on the `user_role` claim, keep `next`, set the `x-pathname` request header, return the Supabase response unchanged; `config.matcher` skips static assets (research.md R1)
- [X] T021 [P] Shared UI: InitialAvatar (first letter of data-model.md Profile.displayName on a token-tinted circle) in src/components/shared/initial-avatar.tsx; EmptyState in src/components/shared/empty-state.tsx; BottomNav (`aria-current`, labels, 44 px) and PageHeader in src/components/layout/; AuthShell (back button, language menu slot) in src/components/layout/auth-shell.tsx
- [X] T022 Profile read side: `getMe(userId)` in src/features/profile/repo.ts (profile, the student's pending/active link with admin name per data-model.md StudentLink.status, unread `system` notices per data-model.md Notification.sourceType, the admin's active invite per data-model.md AdminInvite.active); GET src/app/api/me/route.ts with `requireUser` returning `MeResponse` (contracts/route-handlers.md); `meQuery` in src/features/profile/queries.ts
- [X] T023 Student shell src/app/s/layout.tsx: `requireRole('student')`, redirect to `/join` when there is no active link (data-model.md StudentLink.status) unless `x-pathname` starts with `/s/me`; BottomNav (Today, Courses, Progress, Shifts, Me); placeholder pages with EmptyState in src/app/s/today/page.tsx, src/app/s/courses/page.tsx, src/app/s/progress/page.tsx, src/app/s/shifts/page.tsx
- [X] T024 Admin shell src/app/a/layout.tsx: `requireRole('admin')`, BottomNav (Students, Courses, Plan, Alerts), header avatar linking to `/a/me`; placeholder pages in src/app/a/courses/page.tsx, src/app/a/plan/page.tsx, src/app/a/alerts/page.tsx; add `nav` strings in all three message files
- [X] T025 [P] E2E fixtures: tests/e2e/fixtures/supabase-admin.ts (admin client from `SUPABASE_SECRET_KEY`), tests/e2e/fixtures/users.ts (`testEmail(name)` → `delivered+e2e-<run>-<name>@resend.dev`; `createConfirmedUser({ role, displayName, timezone })` via `auth.admin.createUser`), tests/e2e/global-teardown.ts deleting every user with the run prefix; register the teardown in playwright.config.ts
- [ ] T026 Spike (research.md R5): against the dev project, find a reliable way to get a usable 6-digit code for a user who signed up through the form, trying `generateLink` type `signup`, then `magiclink` verified with `type: 'email'`, then the fallback; implement `getSignupCode(email)` and `getRecoveryCode(email)` in tests/e2e/fixtures/codes.ts and record the outcome under R5 in specs/001-auth-roles-linking/research.md

**Checkpoint**: `pnpm test:db`, `pnpm test`, `pnpm typecheck`, `pnpm lint` pass; signed-out `/` redirects to `/sign-in`; shells render for fixture users.

---

## Phase 3: User Story 1 – Sign up and choose a role (Priority: P1) 🎯 MVP

**Goal**: create an account with a role chosen once; sign in to the right home; admins get their invite code and Welcome screen.

**Independent Test**: sign up as each role and reach the Confirm screen with the detected time zone; sign in with confirmed fixture users and land on Today (student) or Students (admin); picking the wrong role shows "This is a {role} account". The full sign-up → home path is verified once US4 is done.

### Tests for User Story 1

- [X] T027 [P] [US1] Schema tests in src/features/auth/schemas.test.ts: sign-up rejects names outside data-model.md Profile.displayName, passwords under 8 chars or without a letter and a digit (FR-013), time zones outside data-model.md Profile.timezone, roles outside data-model.md Profile.role
- [ ] T028 [P] [US1] Playwright tests/e2e/us1-signup-roles.spec.ts: student and admin sign-up reach `/verify-email` showing the email; time zone shows the browser's zone with Change; Google/Apple buttons absent (FR-001); confirmed fixture users sign in to `/s/today` and `/a/students`; role mismatch shows the message and "Continue as {role}" without changing the role; axe has no serious violations

### Implementation for User Story 1

- [X] T029 [US1] Zod schemas `signUpSchema`, `signInSchema` in src/features/auth/schemas.ts (data-model.md Profile.role, Profile.displayName, Profile.timezone, Profile.locale; password rule FR-013); T027 passes
- [X] T030 [US1] Public actions `signUp`, `signIn` (success, role mismatch; unconfirmed branch added in T036), `signOut` (guarded) and `setLocale` in src/features/auth/actions.ts using `publicAction()`, the limits repo for sends (data-model.md AuthEmailLimit.purpose = `signup`) and the result shapes in contracts/server-actions.md
- [X] T031 [P] [US1] Form pieces: RoleCards in src/features/auth/components/role-cards.tsx; PasswordChecks (live ✓ list) in src/components/shared/password-checks.tsx; TimezonePicker (detected zone, searchable `Intl.supportedValuesOf('timeZone')`) in src/components/shared/timezone-picker.tsx; LanguageSwitcher (calls `setLocale`) in src/components/shared/language-switcher.tsx
- [X] T032 [US1] Sign-in page src/app/(auth)/sign-in/page.tsx matching screenshots/01-Main.png and 13-AdminSignin.png: role cards, email, password, "Forgot password?", "Sign in as {role}", role-mismatch panel with "Continue as {role}", "Create an account" → `/sign-up?role=`; `next` honoured
- [X] T033 [US1] Sign-up page src/app/(auth)/sign-up/page.tsx matching screenshots/02-Signup.png and 14-AdminSignup.png: role cards, name, email, password with PasswordChecks, TimezonePicker, info box, "Create {role} account", "Sign in" link; keeps `role` and `next` query values
- [X] T034 [US1] Admin Welcome: `getOverview(adminId)` in src/features/admin/repo.ts (checklist booleans from contracts/route-handlers.md `AdminOverview`); GET src/app/api/admin/overview/route.ts with `requireRole('admin')`; `overviewQuery` in src/features/admin/queries.ts; InviteCard (code, link, Share via Web Share API or copy, Copy code) in src/features/invites/components/invite-card.tsx; QrDialog (SVG from `qrcode`) in src/features/invites/components/qr-dialog.tsx; WelcomeChecklist in src/features/admin/components/welcome-checklist.tsx; page src/app/a/welcome/page.tsx matching screenshots/15-AdminWelcome.png
- [ ] T035 [US1] Add `auth` and `welcome` strings (en, my, ja) to src/i18n/messages/; T028 passes for the parts that don't need confirmation

**Checkpoint**: sign-in and role routing work; sign-up reaches the Confirm screen.

---

## Phase 4: User Story 4 – Confirm email (Priority: P1)

**Goal**: every account confirms its email with a 6-digit code (or the link) before using the app.

**Independent Test**: sign up, enter the emailed code, land on `/join` (student) or `/a/welcome` (admin); wrong codes, attempt limit, resend cooldown and unconfirmed sign-in behave as in the spec.

### Tests for User Story 4

- [ ] T036 [P] [US4] Playwright tests/e2e/us4-confirm-email.spec.ts (codes from tests/e2e/fixtures/codes.ts): correct code → student `/join`, admin `/a/welcome`; wrong code → "That code isn't right"; 5 wrong codes → must request a new one; Resend disabled with a 60 s countdown; unconfirmed user signing in lands on `/verify-email` with a new code; completes US1 scenarios 1–2 end to end; axe

### Implementation for User Story 4

- [X] T037 [US4] Actions `verifyEmailCode` (`verifyOtp` type `email`, research.md R4) and `resendSignupCode` in src/features/auth/actions.ts, enforcing data-model.md AuthEmailLimit.failedAttempts, AuthEmailLimit.lastSentAt and AuthEmailLimit.sendsInWindow; add the unconfirmed branch to `signIn` (`email_not_confirmed` → send a new code within limits → `{ verify: true, email }`)
- [X] T038 [P] [US4] CodeInput (6 boxes, numeric keyboard, paste of a full code, `aria-label` per box) in src/components/shared/code-input.tsx using the shadcn input-otp component
- [X] T039 [US4] Confirm page src/app/(auth)/verify-email/page.tsx matching screenshots/27-VerifyEmail.png: email shown, CodeInput, "Code expires in {min} min", "Resend in m:ss", wrong-code and limit messages, "Change email" → `/sign-up` prefilled, "Confirm email", "Open email app" on mobile only (research.md R14)
- [X] T040 [US4] Magic-link callback src/app/auth/callback/route.ts: `exchangeCodeForSession`, redirect to a same-site `next` or the role home, failures → `/sign-in?error=link_expired` (contracts/route-handlers.md)
- [ ] T041 [US4] Add `verify` strings to src/i18n/messages/{en,my,ja}.json; T036 and T028 pass

**Checkpoint**: MVP of this feature: people can create confirmed accounts with a role and reach their home.

---

## Phase 5: User Story 2 – Student joins an Admin with an invite code (Priority: P1)

**Goal**: the student sends a request with the admin's code or link; the admin approves or declines; both screens update live.

**Independent Test**: admin shares a code; student enters it and sees the admin's name; admin approves and the student's screen moves into the app within 5 s; decline shows "Request declined"; a regenerated code no longer works.

### Tests for User Story 2

- [ ] T042 [P] [US2] Unit test in src/features/invites/code.test.ts: generated codes always match data-model.md AdminInvite.code and use only its alphabet
- [ ] T043 [P] [US2] Repo tests against the dev database in src/features/links/repo.test.ts: request with an inactive or unknown code → `code_not_found`; request while an active link exists → `already_linked`; a second request withdraws the first (data-model.md StudentLink.status → `removed`); only the link's admin can respond and only to `pending`; approving when the student is already active elsewhere fails (one active link per student); regenerate leaves exactly one active code (data-model.md AdminInvite.active)
- [ ] T044 [P] [US2] Playwright tests/e2e/us2-join-approve.spec.ts with two browser contexts: preview shows the admin's name and course count; request → waiting state; approve → student reaches `/s/today` within 5 s without reload and appears in the admin's list; decline → "Request declined" within 5 s; regenerated code → "Code not found"; a linked student entering another code is told to leave first; signed-out `/join/{code}` shows the sign-up prompt and keeps `next`; admin removing a student updates the student's screen; axe

### Implementation for User Story 2

- [ ] T045 [P] [US2] Invite code generator in src/features/invites/code.ts (`crypto.randomInt` over the data-model.md AdminInvite.code alphabet); T042 passes
- [ ] T046 [US2] Repos: src/features/invites/repo.ts (`findActiveInvite(code)` per data-model.md AdminInvite.active; `regenerate(adminId)` in one transaction with retry on a duplicate code) and src/features/links/repo.ts (`requestJoin`, `respond`, `leave`, `remove` implementing the data-model.md StudentLink.status lifecycle and StudentLink.respondedAt, with `adminId`/`studentId` always in `where`); T043 passes
- [ ] T047 [US2] Actions `requestJoin`, `respondToRequest`, `leaveAdmin`, `removeStudent`, `dismissNotice` (data-model.md Notification.userId must equal the caller) in src/features/links/actions.ts and `regenerateInviteCode` in src/features/invites/actions.ts, with Zod schemas in src/features/links/schemas.ts; guards and error codes per contracts/server-actions.md
- [X] T048 [US2] Reads: GET src/app/api/invites/preview/route.ts (`requireRole('student')`, upper-cased code validated against data-model.md AdminInvite.code) and GET src/app/api/admin/students/route.ts (`requireRole('admin')`); `invitePreviewQuery`, `adminStudentsQuery` in src/features/links/queries.ts; shapes per contracts/route-handlers.md
- [X] T049 [US2] Realtime hook src/features/links/use-link-realtime.ts: subscribe to `student_links` changes filtered by `student_id` or `admin_id`, and on any event invalidate `['me']` or `['admin','students']` (never trust the payload, research.md R7); clean up on unmount
- [X] T050 [US2] Join pages src/app/join/page.tsx and src/app/join/[code]/page.tsx matching screenshots/03-Join.png: signed-out prompt → `/sign-up?role=student&next=/join/{code}`; "Step 2 of 2"; CodeInput prefilled from the URL; preview card; "Send join request"; pending, declined and already-linked states (live via T049); unread system notice banner (data-model.md Notification.occurrenceKey) with dismiss; "Scan QR code instead" help sheet; admins redirected to `/a/students`
- [ ] T051 [US2] Admin Students page src/app/a/students/page.tsx matching screenshots/16-AdminStudents.png (001 scope): InviteCard with ⋯ → Regenerate (confirm dialog); RequestCard (name, "Requested {relative time}" from data-model.md StudentLink.createdAt in the viewer's zone, Decline, Approve) in src/features/admin/components/request-card.tsx; StudentCard (initial, name, linked since, ⋯ → Remove with confirm) in src/features/admin/components/student-card.tsx; live via T049
- [ ] T052 [US2] Add `join` and `students` strings to src/i18n/messages/{en,my,ja}.json; T044 passes

As built (2026-11-24, no tests run yet by the owner's decision): T045–T052 code is in (generator, repos, actions, `/api/invites/preview`, `/api/admin/students/requests` (contracts/route-handlers.md), Realtime, `/join`, request cards and Regenerate on Students, strings). T045, T046 and T052 stay open until T042–T044 are written and pass. Also built ahead of US3: "Leave admin" on Account (part of T063). Not built yet: Remove student (⋯ on the student card; the `removeStudent` action), so T047 and T051 stay open for that part.

**Checkpoint**: accounts plus linking work end to end.

---

## Phase 6: User Story 5 – Forgot and reset password (Priority: P1)

**Goal**: reset a password with an emailed code without revealing whether the account exists.

**Independent Test**: request a reset for an unknown and a known email (same message); reset with the code; other sessions are signed out; the new password works and the old one doesn't.

### Tests for User Story 5

- [ ] T053 [P] [US5] Playwright tests/e2e/us5-reset-password.spec.ts (code from `getRecoveryCode`): identical neutral message for unknown and known emails; live password checks; reset signs out a second logged-in context; sign-in works with the new password only; used or expired code → "This code has expired, send a new one"; axe

### Implementation for User Story 5

- [ ] T054 [US5] Actions `requestPasswordReset` (always the same response; sends within limits with data-model.md AuthEmailLimit.purpose = `recovery`) and `resetPassword` (`verifyOtp` type `recovery`, data-model.md AuthEmailLimit.failedAttempts, `updateUser({ password })`, then `signOut({ scope: 'global' })`) in src/features/auth/actions.ts with schemas in src/features/auth/schemas.ts
- [ ] T055 [US5] Forgot page src/app/(auth)/forgot-password/page.tsx matching screenshots/28-ForgotPassword.png → `/reset-password?email=`
- [ ] T056 [US5] Reset page src/app/(auth)/reset-password/page.tsx matching screenshots/29-ResetPassword.png: CodeInput, "Send again" with cooldown, new and confirm password with PasswordChecks, "Reset password", "You'll be signed out on your other devices", success → `/sign-in?reset=1`
- [ ] T057 [US5] Add `reset` strings to src/i18n/messages/{en,my,ja}.json; T053 passes

**Checkpoint**: all P1 stories complete.

---

## Phase 7: User Story 3 – Manage profile and account (Priority: P2)

**Goal**: both roles edit name, time zone and language; change password; export data; leave admin (students); delete account; sign out.

**Independent Test**: change time zone and see times re-render; export downloads a JSON file; deleting an account (typing DELETE) removes it, and an admin's students see the notice.

### Tests for User Story 3

- [X] T058 [P] [US3] Schema tests in src/features/profile/schemas.test.ts for `updateProfileSchema` (data-model.md Profile.displayName, Profile.timezone, Profile.locale) and `deleteAccountSchema` (exactly `DELETE`)
- [ ] T059 [P] [US3] Playwright tests/e2e/us3-profile-account.spec.ts: rename → avatar initial and header update; change time zone → a relative time re-renders; switch language → UI text changes and persists after sign-in; export downloads JSON with profile and links; change password (wrong current password rejected); student leaves admin → `/join`; student deletes account → cannot sign in; admin deletes account → linked student sees the notice on `/join`; axe

### Implementation for User Story 3

- [X] T060 [US3] Actions in src/features/profile/actions.ts with schemas in src/features/profile/schemas.ts: `updateProfile` (data-model.md Profile.displayName, Profile.timezone, Profile.locale; refresh the `locale` cookie), `deleteAccount` (for admins first insert a notification per linked student using data-model.md Notification.sourceType, Notification.occurrenceKey, Notification.url; then `deleteAuthUser`; then sign out); `changePassword` in src/features/auth/actions.ts (re-check current password, research.md R13)
- [X] T061 [US3] Export: `getExport(userId)` in src/features/profile/repo.ts and GET src/app/api/me/export/route.ts (`requireUser`, attachment filename, shape per contracts/route-handlers.md `Export`)
- [X] T062 [US3] Me pages src/app/s/me/page.tsx and src/app/a/me/page.tsx matching screenshots/11-Profile.png (001 rows only) using ProfileCard (InitialAvatar, name, "Student · reports to {admin}" or "Admin"), EditProfileSheet (name, TimezonePicker) and LanguageSegmented in src/features/profile/components/; "Export my data"; Sign out
- [ ] T063 [US3] Account pages src/app/s/me/account/page.tsx and src/app/a/me/account/page.tsx: change-password form; "Leave admin" with confirm (students, calls `leaveAdmin`); "Delete account" AlertDialog requiring DELETE
- [X] T071 [US3] Light / Dark / Auto on Appearance (spec 007 User Story 1 scenario 1 and FR-001, pulled into 001 by owner decision 2026-11-20): `setColorMode` in src/features/profile/actions.ts (data-model.md Profile.colorMode = light | dark | system), ThemeSync in src/components/shared/theme-sync.tsx, pages src/app/s/me/appearance/page.tsx and src/app/a/(tabs)/me/appearance/page.tsx; Me row "Appearance · Indigo · Inter · {mode}"
- [ ] T064 [US3] Add `me` strings to src/i18n/messages/{en,my,ja}.json; T059 passes

**Checkpoint**: all five user stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T065 [P] Review every `my` and `ja` string for completeness and tone; add a `_review` note listing strings for a native speaker in specs/001-auth-roles-linking/quickstart.md
- [ ] T066 [P] Accessibility and layout pass at 390×844 and 1280×800 (44 px targets, labels, focus order, `aria-label` on icon buttons); fix findings in src/components/ and src/features/*/components/
- [ ] T067 Compare each screen in src/app/(auth)/, src/app/join/, src/app/s/ and src/app/a/ with screenshots/01, 02, 03, 11, 13, 14, 15, 16, 27, 28, 29 at 390×844 and fix layout, hierarchy and copy differences
- [ ] T068 Run every gate from package.json scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`; Lighthouse performance on `/sign-in` (mobile) ≥ 90
- [ ] T069 Walk through specs/001-auth-roles-linking/quickstart.md §4 scenarios 1–14 and note any failures; add a §6 "Production" checklist to quickstart.md for FR-014 (prod Supabase custom SMTP via Resend from a verified domain with SPF/DKIM/DMARC, docs/technical-spec.md §16), checked when the prod project is set up
- [ ] T070 Set **Status** to `Implemented` in specs/001-auth-roles-linking/spec.md (constitution quality gate)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: none. T005 (dashboard + secret key) must be done before T025, T026 and any e2e run.
- **Foundational (2)**: after Setup; blocks every story. T011 before T013; T016–T018 before T019; T019 before T020–T024; T025 before T026.
- **US1 (3)** → **US4 (4)**: US4 completes US1's sign-up path; ship them together.
- **US2 (5)**: after Foundational; uses CodeInput from T038 and InviteCard from T034.
- **US5 (6)**: after Foundational; uses CodeInput (T038), PasswordChecks (T031).
- **US3 (7)**: after Foundational; uses TimezonePicker (T031), `leaveAdmin` (T047).
- **Polish (8)**: after the stories you're shipping.

### Within each story

Tests first and failing → schemas/repos → actions and route handlers → pages → strings → story tests pass.

### Parallel opportunities

- Setup: T002, T003, T004 together.
- Foundational tests: T006–T010 together; then T012, T014–T018, T021, T025 together.
- US1: T027 with T028; T031 alongside T029–T030.
- US2: T042, T043, T044 together; T045 alongside T046.
- After Foundational, US2, US5 and US3 can proceed in parallel with US1/US4 if two people work on it.

---

## Parallel Example: User Story 2

```bash
# Tests together:
Task: "Unit test codes in src/features/invites/code.test.ts"
Task: "Repo tests in src/features/links/repo.test.ts"
Task: "Playwright tests/e2e/us2-join-approve.spec.ts"

# Then independent implementation:
Task: "Invite code generator in src/features/invites/code.ts"
Task: "Realtime hook in src/features/links/use-link-realtime.ts"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup (including T005 by the project owner).
2. Phase 2 Foundational.
3. Phases 3 + 4 (US1 + US4): confirmed accounts with roles. **Stop and validate** with quickstart scenarios 1–4 and 9.

### Incremental delivery

4. US2 (linking): the feature's core for later features 002–004.
5. US5 (reset).
6. US3 (profile and account).
7. Polish, then merge `001-auth-roles-linking` into `main`.

Implement in small batches (`/speckit-implement Phase 1`, `… T006–T010`, …), reviewing each diff and running tests before the next batch.

---

## Notes

- [P] = different files and no dependency on unfinished tasks.
- Never import `src/server/supabase-admin.ts` or anything using `SUPABASE_SECRET_KEY` from client code.
- Every new Route Handler and guarded Server Action starts with a guard; public auth actions use `publicAction()` only.
- Commit after each task group.
