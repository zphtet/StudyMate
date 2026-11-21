<!--
Sync Impact Report — 2.0.0 → 2.0.1 (2026-11-21)
Why PATCH: wording fix in Principle VII that matches its intent (supabase-js was never meant only for uploads);
  no principle added, removed or redefined.
Modified: VII (supabase-js covers all Storage operations: uploads, signed URLs, copy, delete; never table queries).
Added sections: none. Removed sections: none.
Trigger: /speckit-analyze on 002 (finding C1): reading private lesson files needs signed URLs; copy and purge need
  Storage copy/delete.
Dependent docs: CLAUDE.md "Working rules" line on supabase-js aligned to the same wording (outside this file).
  specs/002-courses-lessons/plan.md Constitution Check VII cites 2.0.1. Templates unchanged.
Still open (carried from 2.0.0):
  - 003: lesson status chips (done/overdue/due soon/upcoming) have no SQL function. 002 research R1 chose app code
    for Open/Locked (src/features/courses/lock.ts); 003's /speckit-plan decides whether its chips reuse it.
-->

# StudyMate Constitution

StudyMate is one mobile-first PWA used by two roles: **Student** (studies, submits, tracks shifts) and **Admin** (plans courses, deadlines, reminders for linked students). These principles apply to every feature spec, plan and task. A plan that breaks one must say why in its Complexity Tracking section.

## Core Principles

### I. One app, two roles, explicit permissions
- One codebase and one installable PWA. The role on the user's profile decides layout and routes: `/s/*` (Student, 5 tabs: Today, Courses, Progress, Shifts, Me) and `/a/*` (Admin, 4 tabs: Students, Courses, Plan, Alerts).
- Every feature spec states what each role can see and do. Every plan includes a permission table.
- Access rules are enforced on the server in two layers that apply the same rules. Hiding UI is never the only protection.
  - **Server guards (primary).** Prisma bypasses Row-Level Security, so every Route Handler and Server Action calls a guard from `src/server/auth/guards.ts` before touching data, and every Prisma `where` is scoped to the current user.
  - **Row-Level Security (secondary).** Every table and Storage bucket keeps Supabase RLS. It protects anything reached with the user's token (Realtime, Storage uploads) and backs up the guards.
- A Student sees only their own data and content from their linked Admin. An Admin sees only students linked to them.

### II. Spec first, small features
- Behaviour is written in `spec.md` before code. Changing behaviour means updating the spec first, then re-planning.
- One feature = one screen group. Specs describe *what* and *why*; technology choices belong in `plan.md`.
- Designs are the visual reference: see `screenshots/` and the design canvas.

### III. Test-first (non-negotiable)
- Database: migration + RLS policy + pgTAP tests that each role can and cannot do what the spec says.
- Guards: Vitest tests against the local database for every guard, with the same allowed and denied cases as the pgTAP tests.
- Logic (time/shift math, progress, scheduling): Vitest unit tests written before the implementation.
- Main flows: Playwright end-to-end per user story, at phone width (390×844).
- A task is done only when its tests pass in CI.

### IV. Time is hard: one rule set
- Store every instant as `timestamptz` (UTC). Display in the viewer's IANA timezone (`profiles.timezone`).
- When an Admin acts on a Student's schedule, show the Student's local time first and the Admin's local time beside it.
- A shift is ONE record with `start_at` and `end_at`; an end before the start means it ends the next day. Never split a night shift into two records.
- Notifications are never delivered while the recipient is on shift or in a sleep/quiet block; they are held until the next free moment.

### V. Mobile-first, accessible, themeable
- Design at 390 px first; must work 320–1440 px. Admin editors gain split views on ≥1024 px.
- Tap targets ≥ 44 px; text contrast ≥ 4.5:1 in light and dark mode for all 10 themes.
- Real semantic elements (`button`, `a`, `label` + `input`); icon-only buttons have `aria-label`.
- All colours come from theme tokens (shadcn CSS variables); no hard-coded hex in components.

### VI. Three languages from day one
- UI strings live in `next-intl` message files (`src/i18n/messages/{en,my,ja}.json`) for `en`, `my` (Burmese), `ja` (Japanese). No hard-coded user-facing strings.
- Font stacks always fall back to Noto Sans JP and Noto Sans Myanmar.
- Lesson content is authored Markdown and is not translated by the app.

### VII. Simple, boring stack
- Frontend: **Next.js 16 (App Router) + React 19 + TypeScript (strict)**, **Tailwind CSS v4** (CSS-first, no `tailwind.config.js`), **shadcn/ui** (Radix) + `lucide-react`, `next-themes`, `next-intl`, `react-hook-form` + Zod, **TanStack Query v5 for all data fetching and mutations**, Zustand (small UI state only), `@uiw/react-md-editor` for lesson editing, `react-markdown` + `remark-gfm` + `rehype-sanitize` for rendering, `@dnd-kit`, `date-fns` + `@date-fns/tz`.
- Reads through TanStack Query `queryOptions` factories that call Route Handlers (`src/app/api/**`); Server Components may prefetch the same queries + `HydrationBoundary`. Writes through `useMutation` calling Server Actions that validate with the same Zod schema as the form. `proxy.ts` refreshes the Supabase session and guards `/s/*` and `/a/*`.
- PWA: Serwist (`@serwist/next`) + `app/manifest.ts`; offline write queue in IndexedDB (Dexie).
- Email: Resend (Supabase Auth SMTP + app emails). Hosting: Vercel.
- Backend: Supabase only (Auth, Postgres, RLS, Storage, Realtime, pg_cron + pg_net). Server code reaches tables only through **Prisma 7** (`@prisma/adapter-pg`, queries in each feature's `repo.ts`). supabase-js (`@supabase/ssr`) is used only for Auth, Storage (uploads, signed URLs, copy, delete) and Realtime, never for table queries. Server logic, including the notification dispatcher, runs in Next.js Route Handlers and Server Actions; no custom server unless a spec proves it is needed.
- `prisma/schema.prisma` and the generated Prisma Client are the single source for data types. Rules Prisma can't express (RLS, functions, triggers, CHECK and EXCLUDE constraints, partial indexes) live in the SQL migrations, and a Prisma-generated migration must never drop them.
- `docs/technical-spec.md` and `docs/data-model.md` are the binding technical references; `prisma/migrations/0_init` is the starting schema.

## Quality Gates
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` and `supabase test db` all pass before merge.
- Every Route Handler and Server Action calls a guard before any data access; review rejects one that doesn't.
- `pnpm build` succeeds; Lighthouse PWA installable; performance ≥ 90 on a mid-range phone profile.
- No feature merges without updating its `spec.md` status and screenshots if the UI changed.

## Workflow
`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement` (small batches, review each diff). Feature order follows the roadmap: 001 → 004 and the basic part of 006 form the MVP.

## Governance
This constitution overrides other conventions. Amendments are made in this file with a version bump and a one-line reason, and affected specs are re-checked with `/speckit.analyze`.

**Version**: 2.0.1 | **Ratified**: 2026-11-20 | **Last Amended**: 2026-11-21 (VII: supabase-js covers all Storage operations, not only uploads)
