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
| `profiles` (Profile) | One per auth user; settings | `id` = auth.users.id, `role`, `display_name`, `timezone`, `locale`, `color_mode`, `theme_id`, `font_id`, `font_scale`, `sleep_minutes`, `after_shift_buffer`, `waking_start/end`, `quiet_start/end`, `weekly_goal_days`; spec 005: `shift_presets` (json, Day / Evening / Night start and end times, per student), `shifts_confirmed_week` (date, the Monday of the last week answered in the Sunday check) | 001, 005, 007 |
| `admin_invites` (AdminInvite) | Admin's join code | `admin_id`, `code` (6 chars, unique), `active` | 001 |
| `student_links` (StudentLink) | Student ↔ admin | `student_id`, `admin_id`, `status` pending/active/declined/removed | 001 |
| `courses` (Course) | Course | `owner_id`, `is_personal`, `title`, `icon`, `color`, `level_tag`, `target_date`, `unlock_in_order`, `allow_student_notes` (stored only until a notes feature), `status` draft/active/archived, `deleted_at` | 002 |
| `course_sections` (CourseSection) | Group lessons | `course_id`, `title`, `position` | 002 |
| `lessons` (Lesson) | Markdown lesson | `course_id`, `section_id`, `content_md`, `est_minutes`, `assignment_prompt`, `require_submission`, `unlock_rule` (json), `status` draft/published, `position`, `deleted_at` | 002 |
| `lesson_resources` (LessonResource) | Files, links, audio | `lesson_id`, `kind`, `storage_path`/`url` | 002 |
| `course_assignments` (CourseAssignment) | Course → student + course deadline | `course_id`, `student_id`, `assigned_by`, `due_at`; unique (course, student) | 003 |
| `lesson_deadlines` (LessonDeadline) | Per-lesson deadline override | PK (`lesson_id`, `student_id`), `due_at`, `set_by`; index `lesson_deadlines_student_due` (`student_id`, `due_at`) | 003 |
| `lesson_progress` (LessonProgress) | Completion | PK (`student_id`, `lesson_id`), `status`, `completed_at`, `completed_by`, `minutes_spent` (see below), `client_op_id`; index `lesson_progress_student_completed` (`student_id`, `completed_at`) | 004 |
| `submissions` (Submission) | Student assignment | `student_id`, `lesson_id` (unique pair), `body_md`, `attachments` (json), `status`; spec 008: `client_op_id` (unique, the last offline op applied) | 004, 008 |
| `comments` (Comment) | Notes and review comments | `author_id`, `student_id`, `target_type` (`lesson` = Notes, `submission` = review), `target_id`, `body`; index `comments_thread` (`student_id`, `target_type`, `target_id`, `created_at`) | 004 |
| `study_sessions` (StudySession) | Focus timer | `student_id`, `lesson_id`, `started_at`, `ended_at`, `planned_minutes` (15 or 25), `client_op_id` (a session recorded offline, spec 008); index `study_sessions_student_started` (`student_id`, `started_at`) | 004, 008 |
| `shift_patterns` (ShiftPattern) | Rotation | `student_id`, `sequence` e.g. `DDDONNOO`, `start_date`, `active`, `generated_until` (date, how far its shifts are stored); presets moved to the profile in spec 005 | 005 |
| `shifts` (Shift) | One row per shift | `student_id`, `type`, `start_at`, `end_at` (next day for nights; Off is the whole local day), `sleep_minutes`, `pattern_id` (set when a rotation generated it), `overridden` (edited or deleted by hand: rotations leave it alone); spec 008: `client_op_id` (the last offline op applied), `updated_at` (the version an offline edit is made on; Prisma `@updatedAt`) | 005, 008 |
| `notification_rules` (NotificationRule) | Automatic reminders and personal reminders | `owner_id` (the Admin who made it, or the student for a personal reminder; renamed from `admin_id` in spec 006), `student_id` (null = all the owner's linked students at each occurrence), `trigger`, `config` (json, per trigger: `src/lib/notifications/rule-config.ts`), `message` (1–500), `channels` (`push`, `copy`; the inbox always gets it), `enabled`, `created_at` | 003, 006 |
| `scheduled_messages` (ScheduledMessage) | One-off message | `admin_id`, `body` (1–1000), `lesson_id`, `mode` now/fixed/next_free, `send_at` (null for next_free), `urgent`, `status` scheduled/sent/cancelled | 006 |
| `scheduled_message_recipients` (ScheduledMessageRecipient) | Per-student delivery | PK (`message_id`, `student_id`), `deliver_at` (planned), `delivered_at` (handed over to a `notifications` row; read status lives there, so `read_at` was dropped in spec 006) | 006 |
| `push_subscriptions` (PushSubscription) | Device for Web Push | `user_id`, `endpoint` (unique: a device another user had moves to the new one), `p256dh`, `auth`, `device_label`, `last_seen_at` | 006 |
| `notifications` (Notification) | Every delivery: inbox, queue and de-dupe log | `user_id`, `source_type` (rule/message/system), `source_id`, `occurrence_key`, `title`, `body`, `url`, `sent_at`; spec 006: `deliver_at` (earliest delivery, moved while the recipient is busy), `delivered_at` (null = pending; the inbox lists delivered rows only), `expires_at` (a rule reminder lapses here), `push` (false = inbox only), `urgent`; `read_at`; unique (source, user, occurrence) | 003, 006 |
| `audit_log` (AuditLog) | Admin actions on student data | `actor_id`, `action`, `target` (json), `at` | 004 |

**Enums**: `user_role`, `link_status`, `course_status`, `lesson_status_t`, `progress_status`, `submission_status`, `shift_type`, `rule_trigger`, `message_mode`, `message_status`.

**View**: `course_progress` (student, course → published lessons, done, percent).

**Study time (spec 004 research R2, R3)** comes from two facts, never recalculated after they are written:
- `study_sessions`: counted seconds = `least(coalesce(ended_at, now()), started_at + planned_minutes) − started_at`. `planned_minutes` is 15 or 25; `started_at` and `ended_at` are server time, except for a session run or stopped offline, which keeps the device's time within spec 008's window (research R8). A session counts on the local date it started. A stop under 60 s deletes the row.
- `lesson_progress.minutes_spent`: **only** the estimate credited at completion when the lesson has no focus session (= `lessons.est_minutes`), else 0. Undo and reopen set it back to 0. It counts on the local date of `completed_at`. Never add timer minutes to it: they would count twice.

A lesson's total = `minutes_spent` + its sessions' counted minutes. Daily totals, streaks and the heat calendar read both (`dailyActivity()` in `src/features/progress/repo.ts`).

**Rotations (spec 005 research R4)** are stored as ordinary `shifts` rows 8 weeks ahead, so every reader sees one record per shift:
- Saving a rotation makes it the student's only active one (the previous one becomes inactive) and generates its shifts from its start date or today, whichever is later, to today + 56 days (`generated_until`), in one transaction. A daily Vercel Cron (`/api/cron/rotations`) extends every active rotation to today + 56; a second run the same day inserts nothing.
- A generated day is skipped when the student already has their own shift starting that local date (hand-entered, or `overridden`, of any type, Off included), or when it would overlap a working shift or start at or before now.
- Editing a generated shift sets `overridden`; deleting one leaves an `overridden` Off row for that day, so the rotation doesn't fill it again.
- Changing or deleting the rotation deletes its non-overridden shifts that haven't started; shifts that have started (past and running) are never touched. New preset times or a new sleep length regenerate those future shifts the same way.
- Code: `src/features/shifts/rotation.ts` (pure: which shift each day gets) and `rotation-repo.ts`.

**Notifications (spec 006 research R1–R5, R10, R11)**: every delivery is a `notifications` row, so the inbox, the queue and the de-dupe log are one table:
- Rows come from three sources. 003/004's notices (`system`, `recordNotice`) are due at once. Rule occurrences (`rule`) have keys such as `2026-11-20`, `lessonId@dueISO#h`, `week@{monday}`, or `{studentId}:{key}` for an Admin's copy. One-off messages (`message`, key `message`) are handed over from `scheduled_message_recipients`. The dispatcher makes rule rows and hands messages over up to 10 minutes before they are due, at their planned `deliver_at`, which closes a message's Edit and Cancel send then.
- The dispatcher (`POST /api/cron/dispatch`, every 5 minutes) holds a busy recipient's due rows until `next_free_at` (shift, sleep, outside waking hours, quiet hours; Admins too). Urgent rows go anyway. A rule row that would lapse first (`expires_at`) is deleted, and rule rows whose condition no longer holds are deleted just before delivery. A free recipient's rows due within 10 minutes go with what is due now, as one push per device. Then `delivered_at` is set. Rows older than 90 days are purged daily.
- The unique key (`source_type`, `source_id`, `user_id`, `occurrence_key`) keeps each occurrence to one row, however many runs see it. A newer 003/004 notice for the same item replaces the row and sends it again.
- Lifecycles in detail: specs/006-notifications/data-model.md › Lifecycles. Code: `src/server/notifications/dispatch.ts`.

---

**Offline replays (spec 008 research R7).** `POST /api/sync` writes `client_op_id` on the row each offline op changes (`lesson_progress`, `submissions`, `study_sessions`, `shifts`). A replay whose id is already on the row is a duplicate. A change to an existing row applies only when the row is unchanged since the student saw it: `submissions.updated_at` and `shifts.updated_at` (equality, server time), or the done-state for `lesson_progress`. Otherwise the server's row wins and the change is reported on the device.

## 4. Rules that live only in SQL

Prisma can't describe these, so they stay in the SQL migration. When Prisma generates a diff, **never let it drop them**.

| Kind | What | Why |
| --- | --- | --- |
| CHECK constraints | title lengths, `est_minutes` 1–600, invite code format, shift `end_at > start_at` and ≤ 24 h (spec 005 `shifts_max_length`: ≤ 25 h for Off, a whole local day on a daylight-saving change), `shifts_off_no_sleep` (Off has `sleep_minutes = 0`; spec 005), `sequence` format; spec 002: `courses_color_check`, `courses_description_check`, `courses_level_tag_check`, `course_sections_title_check`, `course_sections_position_check`, `lessons_position_check`, `lessons_assignment_prompt_check`, `lessons_unlock_rule_check`, `lesson_resources_name_check`, `lesson_resources_size_check`, `lesson_resources_target_check`; spec 004: `study_sessions_planned` (`planned_minutes in (15, 25)`), `study_sessions_capped` (`ended_at` ≤ `started_at + planned_minutes`, so a session never counts past its length; research R3); spec 006: `notification_rules_message_len` (1–500), `notification_rules_personal_daily` (`owner_id <> student_id or trigger = 'daily'`: a personal reminder is a daily time), `scheduled_messages_body_len` (1–1000); spec 007: `profiles_theme_id_check` (the 10 theme ids), `profiles_font_id_check` (the 10 font ids), `profiles_font_scale_check` (`font_scale in (0.93, 1.00, 1.13)`, Small / Default / Large; replaced 0_init's 0.85–1.25 range) | Data integrity |
| EXCLUDE constraint | `shifts`: no overlapping working shifts per student (`btree_gist`) | Overlap rule from spec 005 |
| Partial unique indexes | one active invite per admin; one active admin link per student; spec 003: `notification_rules_default_once` (`owner_id`, `student_id`, `trigger`; renamed with the column in 006) where `config->>'preset' = 'default'` (default reminders at most once); spec 004: `study_sessions_one_running` (`student_id`) where `ended_at is null` (one running focus session per student); spec 005: `shift_patterns_one_active` (`student_id`) where `active` (one rotation per student, FR-010) | Spec 001, 003, 004, 005 |
| Partial indexes | active courses/lessons, active assignments, undelivered messages (`smr_due`); spec 002: `courses_deleted`, `lessons_deleted` (Recently deleted and the daily purge); spec 006: `notifications_pending` (`deliver_at`) where `delivered_at is null` (the dispatcher), `notifications_inbox` (`user_id`, `delivered_at desc`) where `delivered_at is not null` (the inbox) | Performance |
| Triggers | `handle_new_user` (profile + invite on sign-up), `prevent_role_change` | Spec 001 |
| Functions | `is_admin_of`, `can_read_course`, `can_read_lesson` (002: Published, non-deleted, readable course, and completed-only in Archived courses; used by `lessons`, `lesson_resources` and `lesson-files` policies), `uuid_folder` (002: Storage path folder as uuid), `admin_lesson_target` (004: the Admin's lesson rule, mirrors `requireAdminLessonTarget`; used by the progress and comment policies), `request_join`, `respond_join`, `preview_invite`, `effective_due`, `busy_segments`, `next_free_at`, `status_at`, `status_now`, `custom_access_token_hook` | Shared logic |
| RLS policies | every table + Storage buckets; spec 003 replaced `deadlines_write` (owner's Published, non-deleted lesson with an active assignment for that student, `set_by` = caller; mirrors `requireAdminLessonTarget`); spec 004 replaced the progress, submission, comment and submission-file policies (below) | Protects supabase-js access (Realtime, Storage, any client query) |
| Storage bucket settings | spec 004: `submissions` bucket `file_size_limit` 2 MB (2097152), `allowed_mime_types` `image/webp`, `image/jpeg` (the browser resizes and re-encodes photos first; research R7) | Upload limits hold even for uploads that skip the app |
| Realtime publication | tables in `supabase_realtime` (§6) | Prisma has no publications |
| FK to `auth.users` | `profiles.id` | Prisma only manages `public` |

**Policies replaced by spec 004** (`*_progress/migration.sql`, research R11). 0_init allowed more than the guards (a student could mark their own work Reviewed or write `completed_by` as anyone), so the migration replaces them by hand:
- `lesson_progress`: `progress_student` → `progress_student_read`, `_insert`, `_update`: the student writes own rows for lessons they can read (`can_read_lesson`), `completed_by` null or self. `progress_admin_write` → `progress_admin_insert`, `_update`: `admin_lesson_target(lesson_id, student_id)`, `completed_by` null or self. `progress_admin_read` is unchanged. Nobody deletes: undo and reopen are updates.
- `submissions`: `subs_student` → `subs_student_read`, `_insert`, `_update`: the student inserts as `draft` or `submitted`, and updates only while the row is `draft` or `needs_redo`, to `draft`, `needs_redo` or `submitted` (with `reviewed_at` null on submit). `subs_admin_review`: only a non-Draft row of a linked student on a lesson in a course the Admin owns, to `reviewed` or `needs_redo`. `subs_admin_read` is unchanged.
- `comments_write`: the target must belong to the thread. A `lesson` target needs the student author and `can_read_lesson`, or `admin_lesson_target` for the Admin. A `submission` target needs the linked Admin, a non-Draft submission of that `student_id`, in a course they own.
- Storage `submission_files_rw` and `submission_files_admin_read` (paths `<student_id>/<lesson_id>/<file>`): `uuid_folder()` instead of raw `::uuid` casts. The student reads and writes their own folder; the Admin reads a file only when that lesson's submission isn't a Draft.
- `study_sessions` policies are unchanged; the checks above enforce the cap.

**Policies replaced by spec 006** (`*_notifications/migration.sql`):
- `rules_admin`: the owner must also have the Admin role (before, any user could own an "All students" rule), and a named student must be linked (`is_admin_of`).
- `rules_student_own` (new): a student manages rules with `owner_id = student_id = auth.uid()` and trigger `daily` (personal reminders, FR-016).
- `rules_student_read`: a student reads only their active Admin's rules for them or for all students (`my_admin_id()`), nothing from an Admin they are no longer linked to.

Call SQL functions from Prisma with typed raw queries, e.g.
```ts
const [s] = await prisma.$queryRaw<{ state: string; until: Date }[]>`select * from status_now(${studentId}::uuid)`
```

---

## 5. Security model with Prisma

- **Prisma bypasses RLS.** It connects as a database owner role. Every Route Handler and Server Action must call a guard from `src/server/auth/guards.ts` (`requireUser`, `requireRole`, `requireAdminOf`, `requireSelfOrAdminOf`, `requireCourseOwner`, `requireCourseReader`) before any query, and scope `where` clauses by the current user.
- Spec 004 guards, each one query that mirrors a policy:
  - `requireAdminLessonTarget(lessonId, studentId)`: renamed from 003's `requireLessonDeadlineTarget`, because deadlines, marking done or reopening, and Admin Notes all need it. A Published, non-deleted lesson in a course the caller owns, a student linked to them, an active assignment of that course for the student. Mirrors `deadlines_write` and SQL `admin_lesson_target()`.
  - `requireSubmissionReviewer(submissionId)` (new): the submission isn't a Draft, its student is actively linked to the caller, and its lesson is in a course the caller owns. Returns `{ me, submission }`. Anything else is 404 `submission_not_found`, so a guessed id reveals nothing. Mirrors `subs_admin_review`.
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

**Realtime**: the browser subscribes with supabase-js and the user's token; Realtime applies the subscriber's SELECT policies, so a client only hears about rows it may read. Tables in the `supabase_realtime` publication:

| Table | Added by | Used for |
| --- | --- | --- |
| `student_links` | 001 (`*_auth_email_limits_realtime`) | live link updates (spec 001 research R7) |
| `submissions`, `comments`, `lesson_progress` | 004 (`*_progress`) | the Admin's Students list and lesson review, the student's lesson screen (spec 004 research R10) |

Clients refetch through TanStack Query on an event and never trust the payload (`useRealtimeInvalidate`, technical spec §7).

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
