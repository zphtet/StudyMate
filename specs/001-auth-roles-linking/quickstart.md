# Quickstart: validate feature 001

How to prove Accounts, Roles and Admin Linking works, against the **dev** Supabase project. Details of each endpoint and action are in `contracts/`; data rules in `data-model.md`.

## 1. Prerequisites (once per Supabase project)

Supabase dashboard → dev project:

| Where | Setting |
| --- | --- |
| Authentication → Sign In / Providers → Email | Confirm email **on**; minimum password length **8**; required characters **letters and digits** |
| Authentication → Email (OTP) | OTP length **6**; OTP expiry **3600** s |
| Authentication → Emails → SMTP | Custom SMTP with Resend: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender from a verified domain |
| Authentication → Emails → Templates | "Confirm signup" and "Reset password" templates show `{{ .Token }}` and keep the link |
| Authentication → Hooks | Customize Access Token (JWT) → Postgres function `public.custom_access_token_hook` |
| Authentication → URL Configuration | Site URL `http://localhost:3000`; redirect URLs include `http://localhost:3000/**` |
| Authentication → Providers | Google and Apple stay **off** (FR-001) |

`.env` (see `.env.example`), in addition to the existing values:

| Variable | Used by |
| --- | --- |
| `SUPABASE_SECRET_KEY` (`sb_secret_…`, Project Settings → API Keys) | server-only account deletion; e2e helpers. Never prefixed with `NEXT_PUBLIC_`. |

## 2. Apply and check the database

```bash
pnpm prisma migrate deploy   # applies the 001 migration (auth_email_limits + Realtime publication)
pnpm test:db                 # pgTAP: 001 tests + existing 005 tests
```
Expected: all files pass. The 001 tests cover: `auth_email_limits` has RLS on and no access for `anon`/`authenticated`; `student_links` is in `supabase_realtime`; profiles/links/invites policies allow the right person and deny cross-student and cross-admin reads (SC-002).

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test       # unit (schemas, limits, invite code generator, initials) + guard tests against dev
pnpm test:e2e   # Playwright, 390×844 and 1280×800, one spec per user story, axe on every page
```
E2E users use `delivered+e2e-<run>-<name>@resend.dev` and are deleted in global teardown.

## 4. Manual validation scenarios

Run `pnpm dev`, open http://localhost:3000 in a phone-sized window. Use real inboxes you control, or Resend test addresses plus the Resend dashboard's email log.

| # | Story | Steps | Expected |
| --- | --- | --- | --- |
| 1 | US1, US4 | Sign up as **Student** (name, email, password `abc12345`) | Time zone shows your detected zone; Confirm screen opens; email arrives with a 6-digit code and a link |
| 2 | US4 | Enter a wrong code 5 times | "That code isn't right" each time; then "request a new code"; Resend works only after the countdown |
| 3 | US4 | Enter the correct code | Lands on "Connect to your admin" (Step 2 of 2) |
| 4 | US1 | In a second browser profile, sign up as **Admin** and confirm | Admin Welcome with invite code, Share / Copy / Show QR, "0 of 4 done" |
| 5 | US2 | Student enters the admin's code | Preview shows the admin's name; "Send join request" → waiting state |
| 6 | US2, FR-015 | Admin opens Students and taps Approve | Within 5 s, without refreshing, the student's screen moves to Today; the student appears in the admin's list |
| 7 | US2 | Repeat with a new student; admin taps Decline | Student sees "Request declined" within 5 s and can enter another code |
| 8 | US2 | Admin regenerates the code; a student enters the old code | "Code not found"; existing students stay linked |
| 9 | US1 | Sign out; sign in as Admin with the **student** account | "This is a student account" + "Continue as student"; role unchanged |
| 10 | US5 | Forgot password with any email | Always "If an account exists for this email, a code is on its way" |
| 11 | US5 | Reset with the code and a new password | Signed out everywhere; can sign in with the new password only |
| 12 | US3 | Student changes time zone and language in Me | Relative times and text re-render immediately |
| 13 | US3 | Export my data | A JSON file with profile and links downloads |
| 14 | US3 | Admin deletes account (types DELETE) | Admin is signed out; linked student sees the "admin closed their account" notice on Join |

## 5. Done when

CLAUDE.md "Done means": Playwright scenarios for US1–US5 pass, `pnpm test:db` and guard tests pass, typecheck and lint are clean, and each screen matches its screenshot at 390×844.
