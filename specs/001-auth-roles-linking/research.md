# Research: Accounts, Roles and Admin Linking (001)

Phase 0 of the plan. Each item: decision, rationale, alternatives. Facts about Supabase, Next.js 16, next-intl and Resend were checked against current docs (sources at the end) and against the dev database on 2026-11-20.

## R1. Session refresh and role routing

- **Decision**: `src/proxy.ts` creates an `@supabase/ssr` server client per request and calls `supabase.auth.getClaims()` (verifies the JWT locally with the project's asymmetric keys). It routes *optimistically* on the `user_role` claim added by the Custom Access Token Hook (`custom_access_token_hook` in `0_init`). Layouts (`/s`, `/a`) and every Route Handler / Server Action re-check with the guards in `src/server/auth/guards.ts`, which call `getUser()` (round-trip to Auth, detects signed-out or deleted users).
- **"Student without an active link → /join"** is checked in `src/app/s/layout.tsx` with Prisma, not in the proxy. The proxy forwards the path in an `x-pathname` request header so the layout can exempt `/s/me`.
- **Rationale**: Next 16 docs say proxy is for optimistic checks, not data fetching or full authorization. Supabase docs require `getClaims()` (not `getSession()`) on the server and a new client per request.
- **Alternatives**: link status as a JWT claim (stale until the token refreshes, so an approved student would be bounced to `/join`); DB lookup in the proxy (slow, discouraged); `getUser()` in the proxy (an Auth round-trip on every request).

## R2. Join, approve, decline, leave: Prisma, not the SQL RPCs

- **Decision**: Implement the link rules in `src/features/links/repo.ts` (Prisma, in `$transaction`), called by guarded Server Actions: student requests with a code, admin approves/declines, student leaves, admin removes. Rules mirror `request_join` / `respond_join` in `0_init`: only students request; not while an active link exists (FR-006); code must be active; only the link's admin responds to a `pending` link. The partial unique index `student_links_one_active` stays the last line of defence.
- **Rationale**: those SQL functions use `auth.uid()`, which is `null` on Prisma's server connection, and CLAUDE.md limits supabase-js to Auth, Storage and Realtime.
- **Alternatives**: call the RPCs through supabase-js with the user token (breaks the rule above); impersonate the user in SQL with `set_config('request.jwt.claims', …)` inside a Prisma transaction (fragile). The SQL functions stay in the database (SQL-only objects are never dropped) but the app doesn't call them.

## R3. Code attempts and resend limits (FR-011)

- **Decision**: New server-only table `auth_email_limits` (see data-model.md) keyed by normalised email + purpose (`signup` | `recovery`). Public auth actions check and update it:
  - send/resend: refuse if the last send was < 60 s ago (return seconds left) or 5 sends already happened in the current 1-hour window;
  - verify: refuse after 5 failed attempts until a new code is sent (a send resets the counter).
  Verification therefore runs in a Server Action (`verifyEmailCode`, `resetPassword`), never directly from the browser.
- **Rationale**: Supabase's own limits are per IP or per user (60 s resend cooldown by default; `/verify` 30 requests per 5 min per IP). They don't give "5 attempts per code" or "5 sends per hour per email".
- **Alternatives**: client-side counters (bypassable); cookie counters (cleared by the user); Supabase limits only (don't match the spec).
- **Privacy**: rows hold an email address (including addresses with no account, from the reset flow). A row older than 24 h is deleted whenever that email is written again; a scheduled sweep can come with feature 006's cron.

## R4. Supabase Auth settings and OTP verification

- **Decision** (dev and prod projects, set in the dashboard; listed in quickstart.md): Confirm email ON; email OTP length 6; OTP expiry 3600 s; minimum password length 8; required characters = letters and digits; confirmation and recovery templates include `{{ .Token }}` plus the link; Custom Access Token Hook → `public.custom_access_token_hook`; custom SMTP = Resend; redirect URLs include `http://localhost:3000/**` (and the production domain later).
- Verification calls `verifyOtp({ email, token, type: 'email' })` for sign-up confirmation (the `signup` type is deprecated) and `type: 'recovery'` for password reset.
- The magic link in the confirmation email lands on `/auth/callback`, which exchanges the code and continues like a verified code.

## R5. End-to-end tests and email codes

- **Decision**:
  - Test inboxes: `delivered+e2e-<run>-<name>@resend.dev` (Resend's test address; delivered without hurting domain reputation; labels after `+` are supported).
  - Codes: test helpers use the Supabase **admin API** with `SUPABASE_SECRET_KEY` (test helpers and the account-deletion module only, never imported by client code) to call `auth.admin.generateLink(...)` and read the email OTP from the response.
  - Users that a story doesn't create through the UI are made with `auth.admin.createUser({ email_confirm: true, user_metadata: { role, display_name, timezone } })`.
  - Global teardown deletes every user whose email starts with `delivered+e2e-<run>-`.
- **Open point (spike task first)**: the docs don't state whether `generateLink({ type: 'signup' })` returns a usable code for a user who already signed up through the form. The first e2e task verifies it against the dev project, trying in order: `signup`, `magiclink` (verify with `type: 'email'`), then, as a last resort, confirming the user with `auth.admin.updateUserById` and covering the verify screen's error paths only.
- **Alternatives**: reading codes from the database (stored hashed); third-party inbox services (extra vendor, flaky); local Mailpit (needs Docker, which this project doesn't use).

## R6. Account deletion (User Story 3)

- **Decision**: Server Action `deleteAccount` (guarded, confirmation text must equal `DELETE`):
  1. if the user is an admin, insert a `system` notification for each linked student (pending or active) so they see "Your admin closed their account" (FR-015);
  2. call `auth.admin.deleteUser(id)` from `src/server/supabase-admin.ts` (`import 'server-only'`, uses `SUPABASE_SECRET_KEY`); deleting `auth.users` cascades to `profiles` and every row that references it (links, invites, notifications…);
  3. sign out the current session.
- **Rationale**: Supabase recommends the admin API; it also removes sessions and refresh tokens. A raw `delete from auth.users` isn't endorsed and leaves sessions valid.
- **Alternatives**: soft delete (spec says data is removed); SQL delete through Prisma (above).
- **Note**: access tokens stay valid until they expire (≤ 1 h), but every guard calls `getUser()`, which fails for a deleted user.

## R7. Live link updates (FR-015, SC-003)

- **Decision**: Add `public.student_links` to the `supabase_realtime` publication (new migration). The student's waiting screen and the admin's Students list subscribe with the browser client (`postgres_changes`, filtered by `student_id` / `admin_id`). Any event only triggers a refetch of `/api/me` or `/api/admin/students` through TanStack Query; payload data is never trusted.
- **Rationale**: RLS applies to insert/update events; delete events are not RLS-filtered and carry only the primary key, so the client must refetch rather than read the payload.
- **Checked**: the dev database has a `supabase_realtime` publication with no tables, and `authenticated` can select `student_links`.
- **Alternatives**: Broadcast via database triggers (more setup; worth it at larger scale); polling every few seconds (fallback if Realtime is unavailable).

## R8. Languages (constitution VI)

- **Decision**: `next-intl` without i18n routing. `src/i18n/request.ts` reads a `locale` cookie, validates it against `en` | `my` | `ja`, falls back to `Accept-Language`, then `en`. Signed-in users' `profiles.locale` is written to the cookie on sign-in and on change. Messages in `src/i18n/messages/{en,my,ja}.json`, one namespace per screen group.
- Burmese and Japanese strings are drafted during implementation and marked for review by a native speaker before release.

## R9. Visual baseline for 001

- **Decision**: Only the default **indigo** theme (light and dark) in `src/app/globals.css` using shadcn variables, `next-themes` (`attribute="class"`, `defaultTheme="system"`), Inter plus Noto Sans JP and Noto Sans Myanmar via `next/font`. The other 9 themes, font picker and text size come with feature 007.
- Icon-only buttons get `aria-label`; tap targets ≥ 44 px; checked at 390×844 and 1280×800.

## R10. Forms and validation

- **Decision**: `react-hook-form` + `zod` + shadcn form controls; the same Zod schema (`src/features/*/schemas.ts`) runs in the Server Action. Password: ≥ 8 characters, at least one letter and one digit (matches the Supabase setting). Live checks under the password field as in `29-ResetPassword.png`.

## R11. Invite codes, share link and QR

- **Decision**: The first code is still created by the `handle_new_user` trigger. Regenerate runs in a Prisma transaction: deactivate the current code, insert a new one made with `crypto.randomInt` over `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (the alphabet allowed by the `admin_invites` CHECK), retry on a unique-code collision. "Share link" uses the Web Share API with copy as fallback; "Show QR" renders an SVG of `${NEXT_PUBLIC_SITE_URL}/join/${code}` with the `qrcode` package.
- "Scan QR code instead" on the join screen opens a help sheet ("Point your phone's camera at your admin's QR code"): the QR holds the invite link, so the camera app already opens it. An in-app scanner is out of scope.
- **Alternatives**: SQL `random_invite_code()` for regeneration (uses `random()`, not cryptographically strong); in-app scanner (camera permission and a scanning library for no extra capability).

## R12. Data fetching (CLAUDE.md working rules)

- **Decision**: `QueryProvider` in the root layout; reads go repo (Prisma) → Route Handler → `queryOptions` in `src/features/*/queries.ts`; Server Components prefetch the same query for first paint. Writes are `useMutation` → Server Action → `{ ok, data | error }`.

## R13. Changing the password (User Story 3)

- **Decision**: "Account and password" asks for the current password; the Server Action re-checks it with `signInWithPassword`, then calls `updateUser({ password })`. Other sessions are left signed in (the spec only requires that for reset).

## R14. Smaller choices

- **Avatar**: initials only (clarification 5): first letter of the display name on a tinted circle using theme tokens.
- **"Open email app"** on the confirm screen: best-effort deep links (iOS `message://`, Android mail-app intent), hidden on desktop.
- **Timezone**: detected with `Intl.DateTimeFormat().resolvedOptions().timeZone`; "Change" opens a searchable list from `Intl.supportedValuesOf('timeZone')`; sent as sign-up metadata so `handle_new_user` stores it.
- **Role in sign-up metadata**: `handle_new_user` reads `role` from user metadata once. That is acceptable here because the role is the user's own choice by design (FR-002); afterwards `profiles.role` is locked by `prevent_role_change` and the JWT claim reads `profiles`, never user metadata (the Supabase security checklist warns against using user metadata for authorization).
- **Placeholder tabs**: the student (Today, Courses, Progress, Shifts, Me) and admin (Students, Courses, Plan, Alerts) shells are built now; tabs owned by later features show an empty state.

## Sources

- Next.js 16 bundled docs: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- Supabase: [Creating a client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Password security](https://supabase.com/docs/guides/auth/password-security), [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [User management](https://supabase.com/docs/guides/auth/managing-user-data)
- next-intl: [App Router without i18n routing](https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing)
- Resend: [Test email addresses](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing), [E2E testing with Playwright](https://resend.com/docs/knowledge-base/end-to-end-testing-with-playwright)
