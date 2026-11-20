# Contract: Server Actions (writes) — 001

Called from `useMutation`. Every action parses its input with the Zod schema the form uses (`src/features/*/schemas.ts`) and returns:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; params?: Record<string, number | string> } }
```
`error.code` maps to a translated message key (`errors.<code>`); `params` fills placeholders such as seconds left.

## Public auth actions (no signed-in user yet)

These can't call `requireUser()` because no user exists yet (see plan.md, Complexity Tracking). They touch only Supabase Auth and the `auth_email_limits` table, keyed by the submitted email, and never reveal whether an account exists unless the user proved they own it (correct password or code). File: `src/features/auth/actions.ts`.

| Action | Input | Success | Errors |
| --- | --- | --- | --- |
| `signUp` | `role`, `displayName` (1–60), `email`, `password` (≥ 8, letter + digit), `timezone` (IANA), `locale` | `{ email }` → client opens `/verify-email?email=` | `invalid_input`, `weak_password`, `cooldown {seconds}`, `too_many_sends {minutes}` |
| `verifyEmailCode` | `email`, `code` (6 digits) | `{ home: '/join' \| '/a/welcome' }`, session cookie set | `wrong_code {attemptsLeft}`, `too_many_attempts`, `code_expired` |
| `resendSignupCode` | `email` | `{ cooldownSeconds: 60 }` | `cooldown {seconds}`, `too_many_sends {minutes}` |
| `signIn` | `role` (picked), `email`, `password` | `{ home }`, or `{ home, roleMismatch: 'student' \| 'admin' }` when the picked role differs, or `{ verify: true, email }` when unconfirmed (a new code is sent, subject to limits) | `invalid_credentials` |
| `requestPasswordReset` | `email` | `{ cooldownSeconds: 60 }`. Always the same response, whether or not the account exists | `cooldown {seconds}`, `too_many_sends {minutes}` |
| `resetPassword` | `email`, `code`, `password`, `confirm` (must match) | `{}` → all sessions signed out, client goes to `/sign-in?reset=1` | `wrong_code {attemptsLeft}`, `too_many_attempts`, `code_expired`, `weak_password`, `passwords_differ` |
| `setLocale` | `locale` | `{}`; sets the `locale` cookie, and `profiles.locale` too when signed in (`requireUser` path) | `invalid_input` |

Notes:
- `signUp` for an email that already has a confirmed account behaves like success (Supabase hides it); no code arrives. This avoids revealing which emails are registered.
- `signIn` never changes the stored role (FR-002, User Story 1 scenario 4).
- After `resetPassword`, the user signs in again with the new password (User Story 5 scenario 2).

## Guarded actions

| Action (file) | Guard | Input | Success | Errors |
| --- | --- | --- | --- | --- |
| `signOut` (`auth/actions.ts`) | `requireUser` | — | `{}`; cookies cleared | — |
| `changePassword` (`auth/actions.ts`) | `requireUser` | `currentPassword`, `newPassword` | `{}` | `wrong_password`, `weak_password`, `same_password` |
| `requestJoin` (`links/actions.ts`) | `requireRole('student')` | `code` | `{ linkId, admin: { displayName } }`; an older pending request is withdrawn | `code_not_found`, `already_linked` |
| `respondToRequest` (`links/actions.ts`) | `requireRole('admin')`, link's `adminId` = caller | `linkId`, `approve: boolean` | `{ status: 'active' \| 'declined' }` | `request_not_found`, `already_linked` (student got linked elsewhere first) |
| `leaveAdmin` (`links/actions.ts`) | `requireRole('student')` | — | `{}`; active link → `removed` | `not_linked` |
| `removeStudent` (`links/actions.ts`) | `requireRole('admin')`, link's `adminId` = caller | `linkId` | `{}`; active link → `removed` | `student_not_found` |
| `dismissNotice` (`links/actions.ts`) | `requireUser`, notification's `userId` = caller | `id` | `{}`; `read_at` set | `notice_not_found` |
| `regenerateInviteCode` (`invites/actions.ts`) | `requireRole('admin')` | — | `{ code, url }`; old code stops working at once | — |
| `updateProfile` (`profile/actions.ts`) | `requireUser` | any of `displayName`, `timezone`, `locale` | updated profile; `locale` cookie refreshed | `invalid_input` |
| `setColorMode` (`profile/actions.ts`) | `requireUser` | `colorMode` (`light` \| `dark` \| `system`) | `{ colorMode }`; saved on the profile, other devices follow (spec 007 FR-001, pulled into 001) | `invalid_input` |
| `deleteAccount` (`profile/actions.ts`) | `requireUser` | `confirm` = `"DELETE"` | `{}`; linked students notified (admins), user deleted via admin API, signed out | `confirm_mismatch` |

**Query invalidation after success**: link actions → `['me']`, `['admin','students']`, `['admin','overview']`; invite → `['me']`, `['admin','overview']`; profile → `['me']`.
