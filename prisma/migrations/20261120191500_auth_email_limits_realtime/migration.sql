-- CreateTable
CREATE TABLE "auth_email_limits" (
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sends_in_window" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMPTZ(6),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_email_limits_pkey" PRIMARY KEY ("email","purpose")
);


-- ── Added by hand (docs/data-model.md §7 step 3; specs/001-auth-roles-linking/data-model.md) ──

-- Allowed values and non-negative counters (spec 001 FR-011).
alter table public.auth_email_limits
  add constraint auth_email_limits_purpose_check check (purpose in ('signup', 'recovery')),
  add constraint auth_email_limits_sends_check check (sends_in_window >= 0),
  add constraint auth_email_limits_failed_check check (failed_attempts >= 0);

-- Server-only: RLS on with no policies, and no privileges for browser roles.
alter table public.auth_email_limits enable row level security;
revoke all on table public.auth_email_limits from anon, authenticated;

-- Live link updates (spec 001 FR-015, research R7). Clients refetch on events; RLS filters inserts/updates.
alter publication supabase_realtime add table public.student_links;
