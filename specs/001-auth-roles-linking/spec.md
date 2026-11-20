# Feature Specification: Accounts, Roles and Admin Linking

**Feature Branch**: `001-auth-roles-linking`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: `01-Main.png` / `13-AdminSignin.png` (sign in, role picker), `02-Signup.png` / `14-AdminSignup.png` (create account), `27-VerifyEmail.png`, `28-ForgotPassword.png`, `29-ResetPassword.png`, `03-Join.png`, `15-AdminWelcome.png`, `16-AdminStudents.png` (invite card, join request)

## Clarifications

### Session 2026-11-20
- Q: Can a student be linked to more than one admin at the same time? → A: No. One active admin per student; to join another admin, the student leaves the current one first.
- Q: Should Google and Apple sign-in be built in this feature? → A: No. This feature ships email + password only; Google and Apple are a follow-up once provider credentials exist, and their buttons stay hidden until configured.
- Q: When an admin approves or declines a join request, how does the student find out in this feature? → A: In the app, live: the waiting screen updates within seconds (or on next open); push and inbox come with feature 006.
- Q: Should an admin's invite code expire on its own after some time? → A: No. A code works until the admin regenerates it; "expired" means replaced.
- Q: What does "edit avatar" mean in this feature? → A: Nothing to edit: the avatar is the display name's first letter on a theme-coloured circle (as in the screens). Photo upload is a later story.

## User Scenarios & Testing

### User Story 1 – Sign up and choose a role (Priority: P1)
A new person creates an account with email and password and chooses **Student** or **Admin**. (Google and Apple sign-in are a follow-up; see FR-001.)

**Why this priority**: Nothing else works without an account and a role.
**Independent Test**: Sign up as each role and land on that role's home screen.

**Acceptance Scenarios**
1. **Given** a new visitor on the welcome screen, **When** they pick "Student", enter a valid email and password and confirm, **Then** an account with role `student` is created and they see "Connect to your admin".
2. **Given** a new visitor, **When** they pick "Admin" and sign up, **Then** an account with role `admin` is created, an invite code is generated, and they see the Admin welcome screen: invite code with Share link / Copy code / Show QR, and a 4-step checklist (create first course, invite a student, assign the course, turn on reminders) before "Go to my dashboard".
3. **Given** the sign-in screen, **When** the user picks Student or Admin and signs in with a matching account, **Then** they land on that role's home (Student → Today, Admin → Students).
4. **Given** the sign-in screen, **When** the picked role does not match the account's role, **Then** the app says "This is a {role} account" and offers "Continue as {role}"; it never changes the stored role.
5. **Given** sign-up, **Then** the timezone is detected from the device and shown with a Change option.

### User Story 2 – Student joins an Admin with an invite code (Priority: P1)
**Why**: The Admin plans everything for linked students only.
**Independent Test**: Admin shares code; student enters it; admin approves; the student moves into the app within 5 seconds. (The admin's assigned courses appear there once features 002–003 exist.)

**Acceptance Scenarios**
1. **Given** an Admin with code `K7P2QX`, **When** a student enters the code (or opens `/join/K7P2QX`), **Then** they see the Admin's name and avatar and can send a join request.
2. **Given** a pending request, **When** the Admin taps Approve, **Then** the link becomes `active`, the student's waiting screen moves into the app within 5 seconds without a refresh, and the student appears in the Admin's Students list.
3. **Given** a pending request, **When** the Admin declines, **Then** the student's waiting screen shows "Request declined" within 5 seconds and they can try another code.
4. **Given** an unknown code, or one the Admin has replaced by regenerating, **When** entered, **Then** the student sees "Code not found" and nothing is created.

### User Story 3 – Manage profile and account (Priority: P2)
Both roles edit name, timezone and language; change password (the current password is asked for first); export data; delete account; sign out.

**Acceptance Scenarios**
1. **Given** a signed-in user, **When** they change timezone, **Then** all times in the app re-render in that zone.
2. **Given** a user who deletes their account, **When** confirmed by typing "DELETE", **Then** their personal data is removed and links are ended.

### User Story 4 – Confirm email (Priority: P1)
Every account, Student or Admin, must confirm its email before using the app.

**Acceptance Scenarios**
1. **Given** a completed sign-up form, **When** the user taps Create account, **Then** a 6-digit code (and a magic link) is emailed and the "Confirm your email" screen opens.
2. **Given** the correct code within 1 hour, **When** entered (or the link is tapped), **Then** the email is confirmed and the user continues: Student → Connect to admin, Admin → Welcome.
3. **Given** a wrong code, **Then** "That code isn't right" is shown; after 5 wrong attempts a new code must be requested.
4. **Given** the resend button, **Then** it is disabled for 60 seconds after each send, with a countdown.
5. **Given** an unconfirmed account, **When** the user signs in with the correct password, **Then** they go to the Confirm screen (a new code is sent) instead of the app.

### User Story 5 – Forgot and reset password (Priority: P1)
**Acceptance Scenarios**
1. **Given** "Forgot password?" on the sign-in screen, **When** the user enters an email and taps Send reset code, **Then** the screen always says "If an account exists for this email, a code is on its way" (it never reveals whether the account exists).
2. **Given** a valid reset code within 1 hour, **When** the user sets a new password that meets the rules and confirms it, **Then** the password changes, other sessions are signed out, and they return to sign in.
3. **Given** an expired or used code, **Then** "This code has expired, send a new one" is shown.
4. **Given** the new password field, **Then** live checks show: at least 8 characters, a letter and a number, passwords match.

### Edge Cases
- Student already linked tries another code → told they must leave their current admin first; no request is created.
- Student with a pending request sends a request to another admin (or the same one again) → the newer request replaces the older one: the older request is withdrawn and disappears from that admin's list.
- Someone signs up with an email that already has an account → the app responds exactly as for a new sign-up (Confirm screen), but no code arrives; it never reveals that the email is registered.
- Admin regenerates the invite code → old code stops working; existing links stay.
- Student unlinks → keeps own history, loses access to admin courses.
- Admin deletes account → linked students are unlinked and see a notice in the app (FR-015).

## Requirements

### Functional Requirements
- **FR-001**: System MUST support sign-up and sign-in with email and password. Google and Apple sign-in are out of scope for this feature (follow-up); their buttons MUST stay hidden until a provider is configured. When added, the provider's verified email counts as confirmed (no code) and the user picks a role once on first sign-in.
- **FR-002**: Users MUST choose exactly one role (`student` or `admin`) at sign-up; the role cannot be changed in the app.
- **FR-003**: Each Admin MUST have one active 6-character invite code (letters and digits, no ambiguous characters) and a share link; the Admin can regenerate it. A code has no time limit: it works until it is regenerated, and the replaced code stops working immediately.
- **FR-004**: A Student MUST be able to request to join an Admin by code or link; the Admin MUST approve before any content is visible.
- **FR-005**: Admins MUST NOT be searchable by name.
- **FR-006**: A Student MUST have at most one active Admin link; to join another Admin they MUST leave the current one first. A Student MUST have at most one pending request; sending a new one withdraws the older pending request.
- **FR-007**: Users MUST be able to edit display name, timezone (IANA) and language (en/my/ja). The avatar MUST be the display name's first letter on a theme-coloured circle and update when the name changes; photo upload is out of scope for this feature.
- **FR-008**: Users MUST be able to export their data (JSON) and delete their account.
- **FR-009**: Role checks MUST be enforced on the server in two layers: a guard before every data access in the app's server code, and RLS on every table. A student MUST NOT read another student's rows or any admin-only data, whether through the app or directly with their own token.
- **FR-010**: Email confirmation MUST be required for email/password accounts before any app data is accessible (Supabase "Confirm email" on; email template includes the 6-digit `{{ .Token }}` and the link).
- **FR-011**: Email confirmation and password reset codes MUST expire after 1 hour, allow max 5 attempts, and resend MUST be rate-limited (60 s between sends, max 5 per hour per email).
- **FR-012**: Password reset MUST use a 6-digit code (`resetPasswordForEmail` + `verifyOtp` type `recovery`), never reveal whether an email exists, and sign out other sessions after a reset.
- **FR-013**: Passwords MUST be at least 8 characters with a letter and a number; checked live on the client and enforced by Supabase Auth settings.
- **FR-014**: Production MUST send auth emails through Resend (Supabase custom SMTP) from a verified domain with SPF/DKIM/DMARC, so codes don't land in spam.
- **FR-015**: Link changes (approved, declined, removed) MUST reach the student in the app: live within 5 seconds while the app is open, otherwise on next open. Push and inbox delivery come with feature 006.

### Permissions
| Action | Student | Admin |
| --- | --- | --- |
| See own profile | ✓ | ✓ |
| See linked student profiles | – | ✓ (own students only) |
| Approve / decline join requests | – | ✓ |
| Leave admin | ✓ | Remove student ✓ |

### Key Entities
- **Profile**: user id, role, display name, timezone, locale (avatar derived from the display name).
- **AdminInvite**: admin, code, created, active flag (no expiry date; replaced codes are inactive).
- **StudentLink**: student, admin, status (pending / active / declined / removed), timestamps.

## Success Criteria
- **SC-001**: A new student can sign up and send a join request in under 2 minutes on a phone.
- **SC-002**: 100% of guard tests and RLS tests pass for cross-student and cross-admin access attempts.
- **SC-003**: Approve → the student's waiting screen moves into the app within 5 seconds without a refresh (Realtime).
