# Contract: UI routes, redirects and screens — 001

Phone first (390×844), checked at 1280×800. All text from `src/i18n/messages/{en,my,ja}.json`; colours from theme tokens; tap targets ≥ 44 px.

## Proxy rules (`src/proxy.ts`, optimistic)

| Request | No session | Session, `user_role` = student | Session, `user_role` = admin |
| --- | --- | --- | --- |
| `/` | → `/sign-in` | → `/s/today` | → `/a/students` |
| `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password` | allow | → `/s/today` (except `/reset-password`) | → `/a/students` (except `/reset-password`) |
| `/auth/callback` | allow | allow | allow |
| `/join`, `/join/[code]` | allow (page shows a sign-up prompt only) | allow | → `/a/students` |
| `/s/**` | → `/sign-in?next=…` | allow | → `/a/students` |
| `/a/**` | → `/sign-in?next=…` | → `/s/today` | allow |

The proxy also sets an `x-pathname` request header. Authoritative checks happen again in layouts and guards: `src/app/s/layout.tsx` sends a student with no active link to `/join` (except `/s/me/**`).

## Screens

| Route | Screenshot | Contents in 001 |
| --- | --- | --- |
| `/sign-in` | `01-Main`, `13-AdminSignin` | language menu; role cards (Student / Admin); email, password; "Forgot password?"; "Sign in as {role}"; role-mismatch message with "Continue as {role}"; "Create an account". Google/Apple buttons hidden (FR-001). |
| `/sign-up?role=` | `02-Signup`, `14-AdminSignup` | back; role cards with "You choose your role once"; name, email, password with live checks; detected time zone + Change (searchable list); "Next, we'll email you a 6-digit code"; "Create {role} account"; "Already have an account? Sign in". `next` query kept for invite links. |
| `/verify-email?email=` | `27-VerifyEmail` | 6 code boxes (OTP input, paste supported); "Code expires in {min} min"; "Resend in m:ss"; wrong-code / too-many-attempts messages; "Change email" → `/sign-up` prefilled; "Confirm email"; "Open email app" (mobile only). |
| `/forgot-password` | `28-ForgotPassword` | email; "Send reset code"; neutral confirmation text; → `/reset-password?email=` |
| `/reset-password?email=` | `29-ResetPassword` | 6 code boxes; "Send again" with cooldown; new + confirm password with live checks; "Reset password"; "You'll be signed out on your other devices." |
| `/join`, `/join/[code]` | `03-Join` | Signed out: "Sign up to join your admin" → `/sign-up?role=student&next=/join/{code}`. Student: "Step 2 of 2"; 6 code boxes (prefilled from the URL); admin preview card (initial, name, "Admin · {n} courses ready"); info text; "Send join request"; "Scan QR code instead" opens a help sheet. Pending: "Waiting for {admin} to approve", live. Declined: "Request declined", try another code. Already linked: must leave first. Unread system notice banner. |
| `/a/welcome` | `15-AdminWelcome` | "Welcome, {name}"; invite card (code, link, Share link, Copy code, Show QR dialog); "Get started · {done} of 4 done" checklist linking to Courses, Students, Courses, Alerts; "Go to my dashboard" → `/a/students`. |
| `/a/students` | `16-AdminStudents` (partial) | header with Me button (avatar) and bell (placeholder until 006); invite card (code, Share link, ⋯ → Regenerate code with confirm); join request cards ("{name} wants to join · Requested {relative time}", Decline ×, Approve), live; student cards (initial, name, linked since, ⋯ → Remove student). Stats and nudge/reminder buttons come with 004/006. |
| `/a/me`, `/s/me` | `11-Profile` (partial) | initial avatar, name, "Student · reports to {admin}" or "Admin"; Edit (sheet: name, time zone); Language segmented control; "Account and password" → `/{s,a}/me/account`; "Export my data" (download); Sign out. Shift, goal, quiet hours, reminders and appearance rows appear with features 005–007. |
| `/s/me/account`, `/a/me/account` | — | change password form; Leave admin (students, confirm dialog); Delete account (dialog: type DELETE). |
| `/s/me/appearance`, `/a/me/appearance` | `12-Appearance` (Mode only) | Light / Dark / Auto, applied instantly and saved to the profile. Colour themes, fonts and text size come with feature 007 (owner decision 2026-11-20). |
| `/s/today`, `/s/courses`, `/s/progress`, `/s/shifts`, `/a/courses`, `/a/plan`, `/a/alerts` | — | layout + bottom nav; empty state naming what comes later (no feature numbers shown to users). |

## Navigation shells
- Student bottom nav (5): Today, Courses, Progress, Shifts, Me.
- Admin bottom nav (4): Students, Courses, Plan, Alerts; Me from the header avatar.
- Active tab marked with `aria-current="page"`; icons from `lucide-react` with visible labels.

## Message namespaces
`common`, `nav`, `auth` (sign-in, sign-up), `verify`, `reset`, `join`, `welcome`, `students`, `me`, `errors` (one key per error code in server-actions.md). Same keys in `en`, `my`, `ja`.
