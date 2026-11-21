# StudyMate — guide for Claude Code

One mobile-first PWA with two roles (Student, Admin) for planning lessons, deadlines, shifts and reminders.

## Read before any work
1. `.specify/memory/constitution.md` — non-negotiable rules (roles + RLS, test-first, time rules, mobile-first, 3 languages, stack).
2. `docs/technical-spec.md` + `docs/data-model.md` — the HOW (data model, ER diagrams, Prisma rules): architecture, folder structure, auth flows, data model, RLS, TanStack Query patterns, notifications, PWA, theming, testing, deployment.
3. The feature spec you are working on in `specs/NNN-*/spec.md` — the WHAT: user stories, acceptance criteria, requirements.
4. The screenshots that spec lists, in `screenshots/` — the visual target. Match layout, hierarchy and copy.

If these disagree: constitution > feature spec (behaviour) > technical spec (implementation) > screenshots (visuals). Flag the conflict instead of guessing.

## Feature order
001 auth-roles-linking → 002 courses-lessons → 003 assign-deadlines → 004 progress-assignments → 005 shifts → 006 notifications → 007 appearance → 008 pwa-offline. MVP = 001–004 + basic 006.

## Stack (fixed)
Next.js 16 App Router · TypeScript strict · Supabase (`@supabase/ssr` for auth/storage/realtime) · Prisma 7 (all DB access) · TanStack Query v5 (all data fetching) · Tailwind CSS v4 · shadcn/ui · `@uiw/react-md-editor` · next-intl · next-themes · Serwist · Dexie · Resend · Vercel · pnpm.

## Working rules
- Schema changes: edit `prisma/schema.prisma`, generate a new migration with `prisma migrate diff`, add RLS policies to it, never drop SQL-only objects (see `docs/data-model.md` §4 and §7). `0_init` is the starting schema.
- **Prisma bypasses RLS: every Route Handler and Server Action calls a guard from `src/server/auth/guards.ts` first**, and every Prisma `where` is scoped to the current user.
- Reads: Prisma in `src/features/<feature>/repo.ts` → Route Handler `src/app/api/**/route.ts` → `queryOptions` in `queries.ts`. Writes: `useMutation` → Server Action in `actions.ts` with a Zod schema from `schemas.ts`.
- supabase-js only for Auth, Storage (uploads, signed URLs, copy, delete) and Realtime — never for table queries.
- UI text goes in `src/i18n/messages/{en,my,ja}.json` — never hard-coded.
- Colours from theme tokens only; tap targets ≥ 44 px; test at 390×844.
- Times: store UTC, show in the viewer's timezone; overnight shifts are one record.
- Never put secrets in code or commits; use `.env.local` (git-ignored).

## Commands
```
pnpm dev            # Next.js dev server
pnpm typecheck      # tsc --noEmit
pnpm lint
pnpm test           # Vitest
pnpm test:e2e       # Playwright
pnpm test:db        # pgTAP RLS/function tests (supabase/tests) against DIRECT_URL
pnpm prisma migrate deploy     # apply prisma/migrations to DIRECT_URL
pnpm prisma generate           # regenerate client after schema changes
```
`.env` points at the **dev** Supabase project (no local Supabase/Docker). New migrations: `docs/data-model.md` §7 (diff `schema.prisma` against git, never `migrate dev` or `--from-config-datasource`).

## Done means
Acceptance scenarios of the user story pass in Playwright, guard and RLS tests pass, typecheck and lint are clean, and the screen matches its screenshot at phone width.
