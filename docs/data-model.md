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
| `courses` (Course) | Course | `owner_id`, `is_personal`, `title`, `icon`, `color`, `level_tag`, `target_date`, `unlock_in_order`, `allow_student_notes` (stored only until a notes feature), `status` draft/active/archived, `deleted_at` | 002 |
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
| CHECK constraints | title lengths, `est_minutes` 1–600, `font_scale` range, invite code format, shift `end_at > start_at` and ≤ 24 h, `sequence` format; spec 002: `courses_color_check`, `courses_description_check`, `courses_level_tag_check`, `course_sections_title_check`, `course_sections_position_check`, `lessons_position_check`, `lessons_assignment_prompt_check`, `lessons_unlock_rule_check`, `lesson_resources_name_check`, `lesson_resources_size_check`, `lesson_resources_target_check` | Data integrity |
| EXCLUDE constraint | `shifts`: no overlapping working shifts per student (`btree_gist`) | Overlap rule from spec 005 |
| Partial unique indexes | one active invite per admin; one active admin link per student | Spec 001 |
| Partial indexes | active courses/lessons, active assignments, undelivered messages; spec 002: `courses_deleted`, `lessons_deleted` (Recently deleted and the daily purge) | Performance |
| Triggers | `handle_new_user` (profile + invite on sign-up), `prevent_role_change` | Spec 001 |
| Functions | `is_admin_of`, `can_read_course`, `can_read_lesson` (002: Published, non-deleted, readable course, and completed-only in Archived courses; used by `lessons`, `lesson_resources` and `lesson-files` policies), `uuid_folder` (002: Storage path folder as uuid), `request_join`, `respond_join`, `preview_invite`, `effective_due`, `busy_segments`, `next_free_at`, `status_at`, `status_now`, `custom_access_token_hook` | Shared logic |
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
- Tests: guard tests (Vitest against the dev database) mirror the pgTAP RLS tests (`pnpm test:db`) — same allowed/denied cases.

---

## 6. Connections

| Variable | Supabase connection | Used by |
| --- | --- | --- |
| `DATABASE_URL` | Transaction pooler (Supavisor), port **6543** | Prisma Client at runtime (Vercel functions) |
| `DIRECT_URL` | Session pooler or direct, port **5432** | Prisma CLI (`migrate deploy`, `migrate diff`) via `prisma.config.ts` |

**Environments**: development uses its own Supabase project (values in `.env`, see `.env.example`); production uses a separate project whose values live only in Vercel. Never put production URLs in `.env`: `pnpm prisma migrate deploy` and `pnpm test:db` run against whatever `DIRECT_URL` points to.

With the Supabase CLI and Docker (optional), both variables can point to the local stack instead: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## 7. Changing the schema

Prisma can't read this database: `profiles.id` references Supabase's `auth.users`, so `prisma migrate diff --from-config-datasource` and `prisma db pull` fail with **P4002** (cross-schema reference), and `prisma migrate dev` has no shadow database with an `auth` schema. Don't use any of them.

Instead, **diff the previous `schema.prisma` (from git) against the edited one**. No database is needed, and because neither file contains the SQL-only objects in §4, the generated SQL can never drop them.

1. Edit `prisma/schema.prisma`. Don't commit it yet: step 2 diffs against the committed version.
2. Generate the SQL into a new folder named `<UTC timestamp>_<name>` (folders are applied in name order):
   ```bash
   name=$(date -u +%Y%m%d%H%M%S)_add_badges
   mkdir -p prisma/migrations/$name
   before=$(mktemp) && git show HEAD:prisma/schema.prisma > "$before"
   pnpm -s prisma migrate diff --from-schema "$before" --to-schema prisma/schema.prisma --script \
     > prisma/migrations/$name/migration.sql
   rm "$before"
   ```
   If the schema edit was already committed, replace `HEAD` with the commit before it.
3. Open the file and add what Prisma can't express: for a new table, `enable row level security` + policies (§5), plus any CHECK constraints, indexes, triggers or functions it needs.
   A change that is SQL only (a function, a policy) has no Prisma diff: create the folder and write `migration.sql` by hand, e.g. `20261120190000_status_now_states`.
4. Apply it to the dev database with `pnpm prisma migrate deploy`. Run `pnpm test:db` (pgTAP) and `pnpm test` (guards), then commit `schema.prisma` and the migration together.
5. `pnpm prisma generate` refreshes the client (it also runs on `postinstall`).

First-time setup on a fresh database: `pnpm prisma migrate deploy` applies every migration. On a database where `0_init` was already applied by hand: `pnpm prisma migrate resolve --applied 0_init`.
