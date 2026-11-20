# StudyMate — Data Model

**Database**: Supabase Postgres · **ORM**: Prisma 7 · **Source files**:
- `prisma/schema.prisma` — models, relations, enums (TypeScript types come from here)
- `prisma/migrations/0_init/migration.sql` — the full SQL, including what Prisma can't express (RLS, functions, triggers, checks)

The two are kept in sync: every Prisma field was checked against the real database (21 tables, 173 columns, nullability identical).

---

## 1. The model in one paragraph

Every user is a **profile** with a role (`student` or `admin`). An admin has an **invite code**; a student joins with it, creating a **student link** the admin approves. Admins own **courses** made of **sections** and **lessons** (Markdown + **resources**). A course reaches a student through a **course assignment** (with an optional course deadline); single lessons can get a **lesson deadline** that overrides it. Students produce **lesson progress**, **submissions**, **study sessions** and **comments**. Students record **shifts** (one row per shift, night shifts end the next day), optionally generated from a **shift pattern**. Admins create **notification rules** and **scheduled messages** (with **recipients**); every delivery lands in **notifications** (the inbox + de-dupe log) and goes to the user's **push subscriptions**.

---

## 2. Diagrams

### 2.1 Accounts, courses and deadlines
![Accounts and courses](data-model-1-accounts-courses.png)

### 2.2 Learning activity and shifts
![Learning and shifts](data-model-2-learning-shifts.png)

### 2.3 Notifications
![Notifications](data-model-3-notifications.png)

Mermaid sources: `data-model.mmd` (all tables) and `data-model-*.mmd` (per domain).

---

## 3. Tables

| Table (Prisma model) | Purpose | Key columns | Spec |
| --- | --- | --- | --- |
| `profiles` (Profile) | One per auth user; settings | `id` = auth.users.id, `role`, `display_name`, `timezone`, `locale`, `color_mode`, `theme_id`, `font_id`, `font_scale`, `sleep_minutes`, `after_shift_buffer`, `waking_start/end`, `quiet_start/end`, `weekly_goal_days` | 001, 005, 007 |
| `admin_invites` (AdminInvite) | Admin's join code | `admin_id`, `code` (6 chars, unique), `active` | 001 |
| `student_links` (StudentLink) | Student ↔ admin | `student_id`, `admin_id`, `status` pending/active/declined/removed | 001 |
| `courses` (Course) | Course | `owner_id`, `is_personal`, `title`, `icon`, `color`, `level_tag`, `target_date`, `unlock_in_order`, `status` draft/active/archived, `deleted_at` | 002 |
| `course_sections` (CourseSection) | Group lessons | `course_id`, `title`, `position` | 002 |
| `lessons` (Lesson) | Markdown lesson | `course_id`, `section_id`, `content_md`, `est_minutes`, `assignment_prompt`, `require_submission`, `unlock_rule` (json), `status` draft/published, `position`, `deleted_at` | 002 |
| `lesson_resources` (LessonResource) | Files, links, audio | `lesson_id`, `kind`, `storage_path`/`url` | 002 |
| `course_assignments` (CourseAssignment) | Course → student + course deadline | `course_id`, `student_id`, `assigned_by`, `due_at`; unique (course, student) | 003 |
| `lesson_deadlines` (LessonDeadline) | Per-lesson deadline override | PK (`lesson_id`, `student_id`), `due_at`, `set_by` | 003 |
| `lesson_progress` (LessonProgress) | Completion | PK (`student_id`, `lesson_id`), `status`, `completed_at`, `completed_by`, `minutes_spent`, `client_op_id` | 004 |
| `submissions` (Submission) | Student assignment | `student_id`, `lesson_id` (unique pair), `body_md`, `attachments` (json), `status` | 004 |
| `comments` (Comment) | Feedback thread | `author_id`, `student_id`, `target_type`, `target_id`, `body` | 004 |
| `study_sessions` (StudySession) | Focus timer | `student_id`, `lesson_id`, `started_at`, `ended_at` | 004 |
| `shift_patterns` (ShiftPattern) | Rotation | `student_id`, `sequence` e.g. `DDDONNOO`, `start_date`, `presets` (json) | 005 |
| `shifts` (Shift) | One row per shift | `student_id`, `type`, `start_at`, `end_at` (next day for nights), `sleep_minutes`, `pattern_id`, `overridden` | 005 |
| `notification_rules` (NotificationRule) | Automatic reminders | `admin_id`, `student_id` (null = all), `trigger`, `config` (json), `message`, `channels`, `enabled` | 006 |
| `scheduled_messages` (ScheduledMessage) | One-off message | `admin_id`, `body`, `lesson_id`, `mode` now/fixed/next_free, `send_at`, `urgent`, `status` | 006 |
| `scheduled_message_recipients` (ScheduledMessageRecipient) | Per-student delivery | PK (`message_id`, `student_id`), `deliver_at`, `delivered_at`, `read_at` | 006 |
| `push_subscriptions` (PushSubscription) | Device for Web Push | `user_id`, `endpoint` (unique), `p256dh`, `auth` | 006 |
| `notifications` (Notification) | Inbox + de-dupe log | `user_id`, `source_type`, `source_id`, `occurrence_key`, `title`, `body`, `url`, `read_at`; unique (source, user, occurrence) | 006 |
| `audit_log` (AuditLog) | Admin actions on student data | `actor_id`, `action`, `target` (json), `at` | 004 |

**Enums**: `user_role`, `link_status`, `course_status`, `lesson_status_t`, `progress_status`, `submission_status`, `shift_type`, `rule_trigger`, `message_mode`, `message_status`.

**View**: `course_progress` (student, course → published lessons, done, percent).

---

## 4. Rules that live only in SQL

Prisma can't describe these, so they stay in the SQL migration. When Prisma generates a diff, **never let it drop them**.

| Kind | What | Why |
| --- | --- | --- |
| CHECK constraints | title lengths, `est_minutes` 1–600, `font_scale` range, invite code format, shift `end_at > start_at` and ≤ 24 h, `sequence` format | Data integrity |
| EXCLUDE constraint | `shifts`: no overlapping working shifts per student (`btree_gist`) | Overlap rule from spec 005 |
| Partial unique indexes | one active invite per admin; one active admin link per student | Spec 001 |
| Partial indexes | active courses/lessons, active assignments, undelivered messages | Performance |
| Triggers | `handle_new_user` (profile + invite on sign-up), `prevent_role_change` | Spec 001 |
| Functions | `is_admin_of`, `can_read_course`, `request_join`, `respond_join`, `preview_invite`, `effective_due`, `busy_segments`, `next_free_at`, `status_at`, `status_now`, `custom_access_token_hook` | Shared logic |
| RLS policies | every table + Storage buckets | Protects supabase-js access (Realtime, Storage, any client query) |
| FK to `auth.users` | `profiles.id` | Prisma only manages `public` |

Call SQL functions from Prisma with typed raw queries, e.g.
```ts
const [s] = await prisma.$queryRaw<{ state: string; until: Date }[]>`select * from status_now(${studentId}::uuid)`
```

---

## 5. Security model with Prisma

- **Prisma bypasses RLS.** It connects as a database owner role. Every Route Handler and Server Action must call a guard from `src/server/auth/guards.ts` (`requireUser`, `requireRole`, `requireAdminOf`, `requireSelfOrAdminOf`, `requireCourseOwner`, `requireCourseReader`) before any query, and scope `where` clauses by the current user.
- **RLS stays on** as a second line of defence and because Supabase **Realtime** and **Storage** use it with the user's token.
- Tests: guard tests (Vitest against the local database) mirror the pgTAP RLS tests — same allowed/denied cases.

---

## 6. Connections

| Variable | Supabase connection | Used by |
| --- | --- | --- |
| `DATABASE_URL` | Transaction pooler (Supavisor), port **6543** | Prisma Client at runtime (Vercel functions) |
| `DIRECT_URL` | Session pooler or direct, port **5432** | Prisma CLI (`migrate deploy`, `migrate diff`) via `prisma.config.ts` |

Locally (Supabase CLI): both point to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## 7. Changing the schema

Supabase's `auth` schema isn't present in a Prisma shadow database, so use a **diff + deploy** workflow instead of `prisma migrate dev`:

1. Edit `prisma/schema.prisma`.
2. Generate the SQL for the change into a new folder, e.g. `prisma/migrations/20261201_add_badges/migration.sql`:
   `pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/20261201_add_badges/migration.sql`
   (check `pnpm prisma migrate diff --help` for the exact flag names in your Prisma 7 version).
3. Open the file: **delete any lines that drop SQL-only objects** from §4, then append the new table's `enable row level security` + policies.
4. `pnpm prisma migrate deploy` (local), run guard + pgTAP tests, commit.
5. `pnpm prisma generate` (also runs on `postinstall`).

First-time setup on a fresh database: `pnpm prisma migrate deploy` applies `0_init`. On a database where `0_init` was already applied by hand: `pnpm prisma migrate resolve --applied 0_init`.
