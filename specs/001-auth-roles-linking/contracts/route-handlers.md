# Contract: Route Handlers (reads) — 001

All reads go through TanStack Query (`src/features/*/queries.ts`) → these handlers → repo (Prisma). Each handler is wrapped in `handle()` and **calls a guard before any Prisma query**.

**Errors** (all endpoints): JSON `{ "error": { "code": string, "message": string } }`
| Status | When |
| --- | --- |
| 400 `invalid_input` | Zod rejected a query parameter |
| 401 `unauthenticated` | no valid session (`requireUser`) |
| 403 `forbidden` | wrong role or not linked |
| 404 `<thing>_not_found` | resource missing or not visible to the caller (never reveals which) |

Dates are ISO 8601 UTC strings; the client formats them in the viewer's timezone.

---

## GET `/api/me`
Guard: `requireUser()`

```ts
type MeResponse = {
  id: string
  email: string
  role: 'student' | 'admin'
  displayName: string
  timezone: string            // IANA
  locale: 'en' | 'my' | 'ja'
  colorMode: 'light' | 'dark' | 'system'   // spec 007 FR-001, pulled into 001 (owner decision 2026-11-20)
  // students only (null for admins)
  link: null | {
    id: string
    status: 'pending' | 'active'           // declined/removed links are not returned
    admin: { id: string; displayName: string }
    requestedAt: string
  }
  notices: { id: string; key: 'admin_deleted'; sentAt: string }[]   // unread system notices (students); key = message key derived from occurrenceKey 'admin-deleted:<admin id>'
  // admins only (null for students)
  invite: null | { code: string; url: string }   // url = NEXT_PUBLIC_SITE_URL + /join/ + code
}
```

## GET `/api/invites/preview?code=K7P2QX`
Guard: `requireRole('student')`
Query: `code` matches `^[A-HJ-NP-Z2-9]{6}$` after upper-casing, else 400.

```ts
type InvitePreview = {
  admin: { displayName: string }
  activeCourses: number       // admin's courses with status 'active' (0 until feature 002)
}
```
404 `code_not_found` when the code is unknown or inactive (replaced). No other admin data is returned.

## GET `/api/admin/students/requests`
Guard: `requireRole('admin')`

```ts
type JoinRequests = {
  requests: { linkId: string; student: { id: string; displayName: string }; requestedAt: string }[]   // pending, newest first
}
```
As built (2026-11-24): planned as `requests` + `students` on `GET /api/admin/students`, but spec 003 took that path for the linked students list and spec 004's `GET /api/admin/students/progress` feeds the student cards, so the requests have their own path.

## GET `/api/admin/overview`
Guard: `requireRole('admin')`. Feeds the Welcome checklist.

```ts
type AdminOverview = {
  invite: { code: string; url: string }
  checklist: {
    courseCreated: boolean    // any course owned by the admin, not deleted
    studentInvited: boolean   // any pending or active link
    courseAssigned: boolean   // any active course assignment by the admin
    remindersOn: boolean      // any push subscription for the admin
  }
  done: number                // count of true items, 0–4
}
```

## GET `/api/me/export`
Guard: `requireUser()`. Returns a file: `Content-Disposition: attachment; filename="studymate-export-YYYY-MM-DD.json"`.

```ts
type Export = {
  exportedAt: string
  profile: { displayName: string; email: string; role: string; timezone: string; locale: string; createdAt: string }
  links: { otherPerson: string; role: 'admin' | 'student'; status: string; createdAt: string; respondedAt: string | null }[]
  invites: { code: string; active: boolean; createdAt: string }[]    // admins
}
```
Later features append their own sections (courses, progress, shifts…).

## GET `/auth/callback?code=…&next=…`
Not a data endpoint: exchanges the code from the confirmation magic link for a session (`exchangeCodeForSession`), then redirects to `next` if it is a same-site path, else to the role home. Invalid or expired code → `/sign-in?error=link_expired`.
