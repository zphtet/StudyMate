# Data Model: Accounts, Roles and Admin Linking (001)

Builds on `prisma/migrations/0_init` (see `docs/data-model.md`). Feature 001 adds **one table** and **one Realtime publication entry**; everything else already exists.

## Existing entities used

### Profile (`profiles`)
| Field | Type | Rules in 001 |
| --- | --- | --- |
| `id` | uuid, = `auth.users.id` | created by trigger `handle_new_user` on sign-up |
| `role` | `student` \| `admin` | chosen once at sign-up (FR-002); trigger `prevent_role_change` blocks updates |
| `displayName` | text, 1–60 chars | sign-up "Your name"; editable (FR-007); source of the initials avatar |
| `timezone` | IANA name | detected at sign-up, editable; must be a valid IANA zone |
| `locale` | `en` \| `my` \| `ja` | editable; mirrored to the `locale` cookie |
| `avatarUrl` | text, nullable | **unused** in 001 (initials only) |

Other profile columns (theme, font, sleep, waking/quiet hours, weekly goal) are untouched until features 005–007.

### AdminInvite (`admin_invites`)
| Field | Type | Rules |
| --- | --- | --- |
| `adminId` | uuid → profiles | admin only |
| `code` | text, unique, `^[A-HJ-NP-Z2-9]{6}$` | first code from `handle_new_user`; regenerate creates a new one |
| `active` | boolean | exactly one active code per admin (partial unique index); no expiry date (clarification 4) |

Regenerate = in one transaction: `active = false` on the current code, insert a new active code.

### StudentLink (`student_links`)
| Field | Type | Rules |
| --- | --- | --- |
| `studentId`, `adminId` | uuid → profiles | student's role = student, admin's role = admin |
| `status` | `pending` \| `active` \| `declined` \| `removed` | see lifecycle |
| `createdAt` | timestamptz | request time ("Requested 10 min ago") |
| `respondedAt` | timestamptz, nullable | set on approve, decline, leave, remove |

At most one `active` link per student (partial unique index `student_links_one_active`, FR-006).

**Lifecycle**

```
            request (student, valid active code, no active link)
                      │
                      ▼
                  pending ──decline (admin)──► declined
                      │
               approve (admin)
                      ▼
                   active ──leave (student) / remove (admin)──► removed
```

- A student may hold one `pending` request at a time; sending a new one withdraws the older pending request (sets it to `removed`), per spec FR-006.
- `declined` and `removed` are final; a new request creates a new row.
- Deleting either account deletes its link rows (FK cascade). For an admin, students first get a `system` notification (below).

### Notification (`notifications`): used for one notice only
When an admin deletes their account, each linked (pending or active) student gets:

| Field | Value |
| --- | --- |
| `sourceType` | `system` |
| `sourceId` | null |
| `occurrenceKey` | `admin-deleted:<admin id>` |
| `title` / `body` | localised at display time from a message key; stored text is the English fallback |
| `url` | `/join` |

The join screen shows unread `system` notices and marks them read when dismissed. The full inbox comes with feature 006.

## New: AuthEmailLimit (`auth_email_limits`)

Server-only counters for FR-011 (research R3). Reached only through Prisma in the public auth actions.

| Field (Prisma → column) | Type | Rules |
| --- | --- | --- |
| `email` → `email` | text | lower-cased, trimmed |
| `purpose` → `purpose` | text, `signup` \| `recovery` | CHECK constraint |
| `windowStartedAt` → `window_started_at` | timestamptz | start of the current 1-hour send window |
| `sendsInWindow` → `sends_in_window` | int ≥ 0 | sends in the current window; max 5 |
| `lastSentAt` → `last_sent_at` | timestamptz, nullable | 60 s cooldown |
| `failedAttempts` → `failed_attempts` | int ≥ 0 | reset to 0 on each send; max 5 |
| `updatedAt` → `updated_at` | timestamptz | rows older than 24 h are deleted when that email is written again |

Primary key `(email, purpose)`. **RLS enabled with no policies**, and `select/insert/update/delete` revoked from `anon` and `authenticated`: browsers can't read or write it, Prisma (server) can.

**Rules (pure function, unit-tested)**

| Situation | Result |
| --- | --- |
| send, `lastSentAt` < 60 s ago | refuse: `cooldown`, seconds left |
| send, window started < 1 h ago and `sendsInWindow` = 5 | refuse: `too_many_sends`, minutes left |
| send allowed | if window older than 1 h → restart window; `sendsInWindow += 1`; `lastSentAt = now`; `failedAttempts = 0` |
| verify, `failedAttempts` = 5 | refuse: `too_many_attempts` (must request a new code) |
| verify fails | `failedAttempts += 1` |
| verify succeeds | delete the row |

## New: Realtime publication

`alter publication supabase_realtime add table public.student_links;`

Insert and update events respect RLS (`links_read`: the student or the admin of the link). Delete events are not RLS-filtered and carry only the primary key, so clients only use events as a signal to refetch (research R7).

## Migration for 001

One folder, `prisma/migrations/<UTC timestamp>_auth_email_limits_realtime/migration.sql`, generated by the `docs/data-model.md` §7 workflow:

1. Add the `AuthEmailLimit` model to `prisma/schema.prisma`; diff against the committed schema to get the `CREATE TABLE`.
2. Append by hand: CHECK constraints (`purpose`, non-negative counters), `enable row level security`, `revoke all … from anon, authenticated`, and the publication change above.
3. pgTAP tests in `supabase/tests/001_*.test.sql` (see quickstart.md).
