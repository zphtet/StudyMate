# StudyMate — Technical Specification

**Status**: Draft v1.2 · **Date**: 2026-11-20 · **Applies to**: features 001–008 in `specs/`
**Stack**: Next.js 16 (App Router) · TypeScript · Supabase · Prisma 7 · TanStack Query · Tailwind CSS v4 · shadcn/ui · Serwist (PWA) · Resend · Vercel

This document is the *how*. Feature specs in `specs/` are the *what*. When `/speckit.plan` runs for a feature, it must follow this document and the constitution; deviations go in the plan's Complexity Tracking section.

---

## 1. Architecture overview

```
┌──────────────────────────── Installed PWA (Android / iOS / desktop) ────────────────────────────┐
│ Next.js 16 App Router                                                                            │
│  ├─ Server Components          ── layouts, auth checks, prefetch → HydrationBoundary            │
│  ├─ TanStack Query (all reads) ── useQuery → Route Handlers /api/* → guards → Prisma             │
│  ├─ Mutations                  ── useMutation → Server Actions → guards → Prisma (optimistic)     │
│  ├─ supabase-js (browser)      ── Auth, Storage uploads, Realtime only                           │
│  ├─ proxy.ts                   ── refreshes Supabase session, role guard for /s/* and /a/*       │
│  └─ Service worker (Serwist)   ── precache, runtime cache, push + notificationclick              │
│ IndexedDB (Dexie)              ── offline write queue + persisted query cache                    │
└───────────────┬──────────────────────────────────────────────────────────────▲──────────────────┘
                │ Prisma (pooler :6543) · supabase-js (Auth/Storage/Realtime)    │ Web Push
┌───────────────▼───────────────────────────── Supabase ─────────────────────────┴──────────────────┐
│ Auth (email + OTP confirm, Google, Apple) · Postgres + RLS · Storage · Realtime                   │
│ pg_cron + pg_net (every 5 min) ──► POST /api/cron/dispatch (Next.js) ──► web-push / Resend        │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
Hosting: Vercel (Next.js) + Supabase Cloud. All email via Resend (Supabase Auth SMTP + app emails).
```

**Principles**
- **TanStack Query is the single data-fetching layer.** Every read is a query with a typed key from `queryKeys`; Server Components may prefetch the same query and pass it through `HydrationBoundary` for a fast first paint.
- Writes are TanStack `useMutation`s that call Server Actions, with optimistic updates and targeted invalidation.
- **Prisma is the only way server code touches the database.** Prisma bypasses RLS, so every Route Handler and Server Action calls an authorization guard (`src/server/auth/guards.ts`) first. RLS stays on for supabase-js (Realtime, Storage) and as a safety net.
- Supabase is the only backend. No custom API server.

---

## 2. Tech stack and versions

| Area | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16.x, App Router, React 19, TypeScript strict | Turbopack default; Node ≥ 20.9 |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config.js`) | Theme tokens as CSS variables |
| Components | shadcn/ui (Radix primitives), `lucide-react` icons | Components copied into `src/components/ui` |
| Dark mode | `next-themes` (class strategy) | Light / Dark / System |
| Forms | `react-hook-form` + `zod` + shadcn `Form` | Same Zod schema used in Server Action |
| Data fetching | **TanStack Query v5** for all reads and mutations | Server prefetch + `HydrationBoundary`; persisted to IndexedDB for offline; Devtools in dev |
| Server writes | Server Actions (called from `useMutation`) | Same Zod schema as the form |
| UI state | Zustand (small stores only) | e.g. editor tab, focus timer |
| Auth, Storage, Realtime | Supabase: `@supabase/ssr`, `@supabase/supabase-js` | Not used for table queries |
| ORM | **Prisma 7** (`prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg`, `prisma.config.ts`) | Types for all data; see `docs/data-model.md` |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | Same renderer for admin preview and student view |
| Markdown editor | `@uiw/react-md-editor` (loaded with `next/dynamic`, `ssr: false`) | Edit / Preview tabs on mobile (`preview="edit"`/`"preview"`), `"live"` split ≥ 1024 px; preview uses our own `Markdown` component |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Lessons, sections, Plan deadlines |
| Dates & time zones | `date-fns` v4 + `@date-fns/tz` | All instants UTC; display in IANA zone |
| i18n | `next-intl` (no locale in URL; locale from profile/cookie) | `en`, `my`, `ja` |
| PWA | Serwist (`@serwist/next`, `serwist`) + `app/manifest.ts` | SW disabled in `next dev` |
| Push | Web Push (VAPID) via `web-push` in a Next.js Route Handler | iOS 16.4+ installed PWA only |
| Offline queue | Dexie (IndexedDB) | Replays writes with idempotency keys |
| Tests | Vitest + Testing Library, Playwright, pgTAP (`supabase test db`) | 390×844 viewport in e2e |
| Lint/format | ESLint (next config), Prettier, `tsc --noEmit` | Run in CI |
| Package manager | pnpm | |
| Email | **Resend** | Supabase Auth custom SMTP (`smtp.resend.com`) + Resend API for app emails (weekly summary) with React Email templates |
| Hosting | **Vercel** | Preview deploy per branch/MR, production on `main` |
| Monitoring (optional) | Sentry | Server + client |

---

## 3. Project structure

```
studymate/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/                      # public: no session required
│  │  │  ├─ sign-in/page.tsx           # role picker (Student/Admin), email+password, OAuth
│  │  │  ├─ sign-up/page.tsx
│  │  │  ├─ verify-email/page.tsx      # 6-digit OTP
│  │  │  ├─ forgot-password/page.tsx
│  │  │  ├─ reset-password/page.tsx
│  │  │  └─ auth/callback/route.ts     # OAuth + magic-link code exchange
│  │  ├─ join/[code]/page.tsx          # invite link → join request
│  │  ├─ s/                            # Student area (StudentLayout: 5 tabs)
│  │  │  ├─ layout.tsx
│  │  │  ├─ today/page.tsx
│  │  │  ├─ courses/page.tsx · courses/[courseId]/page.tsx · lessons/[lessonId]/page.tsx
│  │  │  ├─ progress/page.tsx
│  │  │  ├─ shifts/page.tsx · shifts/new/page.tsx · shifts/[shiftId]/page.tsx
│  │  │  └─ me/page.tsx · me/appearance/page.tsx · me/reminders/page.tsx
│  │  ├─ a/                            # Admin area (AdminLayout: 4 tabs)
│  │  │  ├─ layout.tsx
│  │  │  ├─ welcome/page.tsx
│  │  │  ├─ students/page.tsx · students/[studentId]/page.tsx
│  │  │  ├─ courses/page.tsx · courses/new/page.tsx · courses/[courseId]/page.tsx
│  │  │  │   └─ lessons/[lessonId]/edit/page.tsx
│  │  │  ├─ plan/page.tsx
│  │  │  ├─ alerts/page.tsx · alerts/rules/[ruleId]/page.tsx · alerts/messages/new/page.tsx
│  │  │  └─ me/page.tsx
│  │  ├─ manifest.ts                   # Web App Manifest
│  │  ├─ sw.ts                         # Serwist service worker source
│  │  ├─ layout.tsx                    # <html>, fonts, ThemeProvider, NextIntlClientProvider
│  │  └─ globals.css                   # Tailwind v4 + theme tokens (10 themes × light/dark)
│  ├─ features/                        # one folder per spec
│  │  ├─ auth/        (actions.ts, schemas.ts, components/)
│  │  ├─ courses/     (actions.ts, queries.ts [queryOptions], repo.ts [Prisma], schemas.ts, components/)
│  │  ├─ assignments/ ├─ progress/ ├─ shifts/ ├─ notifications/ ├─ appearance/
│  ├─ components/
│  │  ├─ ui/                           # shadcn/ui generated
│  │  ├─ layout/ (BottomNav, SideNav, PageHeader)
│  │  └─ shared/ (Markdown, CalendarMonth, DayBar, ProgressBar, EmptyState)
│  ├─ lib/
│  │  ├─ prisma.ts                     # PrismaClient singleton (adapter-pg, pooler URL)
│  │  ├─ supabase/ (server.ts, client.ts)  # auth, storage, realtime
│  │  ├─ time.ts                       # tz helpers, overnight math (unit-tested)
│  │  ├─ availability.ts               # busy_segments() + the free gaps between them; previews
│  │  ├─ offline/ (db.ts [Dexie], queue.ts, sync.ts)
│  │  └─ utils.ts                      # cn(), etc.
│  ├─ i18n/ (request.ts, messages/en.json, my.json, ja.json)
│  ├─ generated/prisma/                # prisma generate output (git-ignored)
│  ├─ server/auth/guards.ts            # requireUser / requireAdminOf / requireCourseReader …
│  ├─ app/api/**/route.ts              # GET endpoints for TanStack Query (guards + Prisma)
│  └─ proxy.ts                         # session refresh + role guard
├─ prisma/
│  ├─ schema.prisma                    # models (validated against the DB)
│  └─ migrations/0_init/migration.sql  # full SQL incl. RLS, functions, triggers (tested)
├─ prisma.config.ts                    # Prisma 7 CLI config (DIRECT_URL)
├─ supabase/
│  ├─ config.toml                      # local stack (auth, storage, email templates)
│  ├─ tests/*.sql                      # pgTAP RLS tests
│  └─ seed.sql
├─ tests/e2e/*.spec.ts                 # Playwright
├─ specs/ · .specify/ · screenshots/ · docs/
└─ next.config.ts · components.json · package.json
```

---

## 4. Routing, roles and session

- **`proxy.ts`** (Next 16 replacement for middleware) runs on every request except static assets:
  1. Creates the `@supabase/ssr` server client and calls `supabase.auth.getUser()` to refresh the session cookie.
  2. No user → only `(auth)` routes and `/join/*` allowed; others redirect to `/sign-in?next=…`.
  3. User with unconfirmed email → redirect to `/verify-email`.
  4. Reads `role` from the JWT custom claim (§6.4) — no DB round-trip. `/s/*` requires `student`, `/a/*` requires `admin`; mismatch redirects to the user's home.
  5. Student with no active link → redirect to `/join` (except `/s/me`).
- Layout files (`s/layout.tsx`, `a/layout.tsx`) re-check the role server-side (defence in depth) and render the correct bottom nav.
- Root `/` redirects: student → `/s/today`, admin → `/a/students`.
- Security never relies on routing: guards (server code) and RLS (user-token access) enforce every rule.

---

## 5. Authentication flows (spec 001)

| Flow | Implementation |
| --- | --- |
| Sign up (email) | Server Action → `supabase.auth.signUp({ email, password, options: { data: { role, display_name, timezone } } })`. "Confirm email" is ON in Supabase. Trigger `handle_new_user` creates `profiles` (+ `admin_invites` for admins). Redirect to `/verify-email?email=`. |
| Confirm email | Email template contains `{{ .Token }}` (6 digits) and the link. Page calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`. Resend: `supabase.auth.resend({ type: 'signup', email })`, UI cooldown 60 s. |
| Sign in | `signInWithPassword`. Error `email_not_confirmed` → resend code + go to `/verify-email`. If the picked role ≠ account role → show "This is a {role} account · Continue as {role}". |
| OAuth | `signInWithOAuth({ provider: 'google' | 'apple', options: { redirectTo: /auth/callback } })`; callback route exchanges the code. First OAuth sign-in without a role → `/sign-up/role` step to choose role once. |
| Forgot password | `resetPasswordForEmail(email)` with template showing `{{ .Token }}`; always show the neutral message. |
| Reset password | `verifyOtp({ email, token, type: 'recovery' })` → `updateUser({ password })` → `signOut({ scope: 'others' })`. |
| Rate limits | Supabase Auth rate limits + server-side per-email counters in `auth_email_limits` (60 s cooldown, 5 sends per hour, 5 wrong codes; spec 001 FR-011); OTP expiry 3600 s; password min length 8 in Auth settings. |
| SMTP | Resend as Supabase custom SMTP (host `smtp.resend.com`, port 465, user `resend`, password = Resend API key). Verified sending domain with SPF + DKIM (+ DMARC) before launch; sender e.g. `StudyMate <no-reply@yourdomain>`. |

**Invite & link**: `/join/[code]` (or code entry) → Server Action `requestJoin(code)` → `requireRole('student')` → Prisma in `src/features/links/repo.ts` (finds the active code without exposing admins; withdraws an older pending request). Admin approves or declines with `respondToRequest(linkId, approve)` → `requireRole('admin')` → Prisma, with the link's `adminId` in `where`. The SQL RPCs `request_join` / `respond_join` stay in the database but the app doesn't call them: they rely on `auth.uid()`, which is null on Prisma's connection (specs/001 research R2).

---

## 6. Data model

The full model, ER diagrams, table catalogue, SQL-only rules and the migration workflow are in **`docs/data-model.md`**.

- **Models**: `prisma/schema.prisma` — 21 models, 10 enums (snake_case in Postgres via `@@map`/`@map`, camelCase in TypeScript).
- **SQL**: `prisma/migrations/0_init/migration.sql` — tables plus everything Prisma can't express: RLS policies, `SECURITY DEFINER` functions (`request_join`, `effective_due`, `busy_segments`, `next_free_at`, `status_now` …), triggers (`handle_new_user`, `prevent_role_change`), CHECK and EXCLUDE constraints, partial indexes, Storage buckets/policies, the JWT role hook. Tested on Postgres 16.
- **Prisma ↔ DB**: every Prisma field was verified against the database (173 columns, identical nullability).

### 6.1 Access control (two layers)
1. **Server guards (primary)** — `src/server/auth/guards.ts`, used by every Route Handler and Server Action because Prisma bypasses RLS:
   `requireUser()` · `requireRole(role)` · `requireAdminOf(studentId)` · `requireSelfOrAdminOf(studentId)` · `requireCourseOwner(courseId)` · `requireCourseReader(courseId)`. Queries are always scoped by the current user in `where`.
2. **RLS (secondary)** — on every table and Storage bucket; protects anything reached with the user's token (Realtime, Storage, any supabase-js query). Same rules as the guards.

### 6.2 JWT role claim
A Supabase **Custom Access Token Hook** (`custom_access_token_hook`) adds `user_role` to the JWT so `proxy.ts` can route without a DB query.

### 6.3 Calling SQL functions from Prisma
```ts
const rows = await prisma.$queryRaw<{ kind: string; start_at: Date; end_at: Date }[]>`
  select * from busy_segments(${studentId}::uuid, ${from}, ${to})`
```
Guard first (`requireSelfOrAdminOf(studentId)`); `busy_segments` also checks the caller when called with a user token.

---

## 7. Data access patterns (TanStack Query + Prisma)

```
Client component ──useQuery──► GET /api/... (Route Handler) ──guard──► repo (Prisma) ──► Postgres
Client component ──useMutation──► Server Action ──Zod──guard──► repo (Prisma) ──► Postgres
Server Component (page) ──prefetch the same queryOptions──► repo (Prisma) ──► HydrationBoundary
```

**Setup**
- `src/lib/query/client.ts`: one `QueryClient` per browser session (`staleTime: 30_000`, `gcTime: 24h`, `retry: 2`), provided by `QueryProvider` in `app/layout.tsx`.
- `src/lib/query/server.ts`: `getQueryClient()` wrapped in React `cache()` for Server Component prefetching.
- `persistQueryClient` with an IndexedDB persister (`idb-keyval`) for offline reads (§10). Devtools in development.

**Repository (Prisma, server-only)** — the only place queries are written:
```ts
// src/features/courses/repo.ts
import 'server-only'
export async function listCoursesForAdmin(adminId: string, status: CourseStatus) {
  return prisma.course.findMany({
    where: { ownerId: adminId, status, deletedAt: null },
    select: { id: true, title: true, icon: true, color: true, status: true,
              _count: { select: { lessons: { where: { deletedAt: null } }, assignments: true } } },
    orderBy: { updatedAt: 'desc' },
  })
}
```

**Read endpoint (Route Handler)**:
```ts
// src/app/api/admin/courses/route.ts
export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireRole('admin')
    const status = courseStatusSchema.parse(new URL(req.url).searchParams.get('status') ?? 'active')
    return listCoursesForAdmin(me.id, status)
  })                                   // handle(): AuthError → 401/403/404 JSON, Zod → 400
}
```

**Query options (shared by client and server prefetch)**:
```ts
// src/features/courses/queries.ts
export const courseKeys = { all: ['courses'] as const, list: (s: CourseStatus) => ['courses', 'list', s] as const }
export const adminCoursesQuery = (status: CourseStatus) => queryOptions({
  queryKey: courseKeys.list(status),
  queryFn: () => api<CourseListItem[]>(`/api/admin/courses?status=${status}`),
})
// client: const { data } = useSuspenseQuery(adminCoursesQuery('active'))
// server prefetch: queryClient.prefetchQuery({ ...adminCoursesQuery('active'),
//                    queryFn: async () => listCoursesForAdmin((await requireUser()).id, 'active') })
```

**Write (Server Action + useMutation)**:
```ts
// src/features/courses/actions.ts
'use server'
export async function createCourse(input: unknown) {
  return action(async () => {
    const me = await requireRole('admin')
    const v = courseSchema.parse(input)              // same Zod schema as the form
    return prisma.course.create({ data: { ...v, ownerId: me.id } })
  })                                                  // action(): returns { ok, data } | { ok: false, error }
}
// client
const create = useMutation({
  mutationFn: async (v: CourseInput) => unwrap(await createCourse(v)),
  onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.all }),
})
```

**Rules**
- No Prisma import in client code (`import 'server-only'` in `lib/prisma.ts` and every `repo.ts`).
- Every Route Handler / Server Action starts with a guard; every Prisma `where` includes the user scope.
- Multi-row changes (assign to many students, reorder lessons) use `prisma.$transaction`.
- Optimistic updates for instant actions (mark complete, toggle rule, reorder) with rollback in `onError`.
- **Realtime → cache**: `useRealtimeInvalidate(table, filter, queryKey)` subscribes with supabase-js (RLS applies) and calls `invalidateQueries` for `student_links`, `submissions`, `notifications`, `lesson_progress`.
- Dates cross the wire as ISO strings; parse with `@date-fns/tz` in the client.

## 8. Time & scheduling rules (constitution IV)

- DB stores `timestamptz`. UI converts with `@date-fns/tz` using `profiles.timezone`.
- Entering a time for a student (deadline, message) uses the **student's** zone; the UI shows "18:00 her time · 15:30 your time".
- Overnight shift input: if `end_time <= start_time`, `end_at = start_at date + 1 day`. Implemented in `lib/time.ts` with property tests.
- Study-day boundary for streaks: local midnight in the student's zone (open question in spec 004).
- Quick times in the message composer that are already past today roll to tomorrow.

---

## 9. Notifications (spec 006)

**Pipeline**
1. `pg_cron` every 5 min calls the Next.js Route Handler `POST /api/cron/dispatch` via `pg_net` with `Authorization: Bearer CRON_SECRET` (works on any Vercel plan; Vercel Cron can replace pg_cron if your plan allows 5-minute schedules).
2. The handler (Node runtime, Prisma) computes due items for window `[now-5m, now]`:
   - rules: daily, after-shift (`shift.end_at + offset`), due-soon, overdue (+ repeats), streak-at-risk, inactivity, weekly summary;
   - `scheduled_message_recipients` with `deliver_at <= now and delivered_at is null`.
3. For each (user, item): if `next_free_at(student, now)` is later than now (shift, sleep, quiet hours or outside waking hours) → set `deliver_at` to it and skip (unless `urgent`). Don't use `status_now` here: it reports quiet hours as `free`.
4. Insert into `notifications` with a unique `occurrence_key` (dedupe), bundle multiple items for the same user into one push.
5. Send via `web-push` to every `push_subscriptions` row; delete subscriptions that return 404/410.
- **Send test**: Server Action `sendTestPush()` called from the rule builder.
- **Email channel** (weekly summary): the dispatcher calls the Resend API (`RESEND_API_KEY`) with a React Email template rendered to HTML; respects the user's locale.
- **VAPID** keys: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client subscribe) and `VAPID_PRIVATE_KEY` (server env on Vercel).
- **Client**: after the user taps "Turn on reminders", `navigator.serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → Server Action saves the subscription. On iOS show the "Add to Home Screen" guide first if `!navigator.standalone`.

---

## 10. PWA & offline (spec 008)

- **Manifest**: `app/manifest.ts` — name, short_name, `display: 'standalone'`, `start_url: '/'`, theme/background colours, icons 192/512 + maskable, `screenshots` for install UI.
- **Service worker**: Serwist via `@serwist/next` (`withSerwist` in `next.config.ts`, `swSrc: 'src/app/sw.ts'`, disabled in dev). Strategies:
  - app shell & static: precache;
  - `/s/lessons/*` HTML + lesson JSON: StaleWhileRevalidate;
  - Supabase Storage images/audio: CacheFirst with expiration (max 200 entries / 30 days, 20 MB per course budget);
  - navigations offline → cached page or `/offline` fallback.
  - `push` → `showNotification`; `notificationclick` → focus/open the deep link.
- **Offline writes**: client screens that must work offline (lesson complete/undo, submission draft, focus session, shift edit) write to Dexie `queue` with `{ id: uuid, op, payload, createdAt }`, update the TanStack Query cache optimistically, and `sync.ts` replays to Supabase on `online` / app focus. TanStack Query `networkMode: 'offlineFirst'` for these mutations; reads come from the persisted cache. Server side uses the `id` as an idempotency key (`on conflict do nothing`).
- **Updates**: Serwist `skipWaiting` disabled; show a "Update ready — Reload" toast when a new SW is waiting.

---

## 11. Theming, fonts, language (spec 007)

- **Tokens**: shadcn's CSS variables (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--border`, `--ring`, `--chart-1…5`, etc.) defined in `globals.css`.
- **10 themes**: `[data-theme="indigo"] { --primary: …; }` and `.dark[data-theme="indigo"] { … }` for each of indigo, ocean, teal, forest, sunset, rose, sakura, lavender, slate, mocha. Status colours (success/warning/danger) shared.
- **Dark mode**: `next-themes` `ThemeProvider attribute="class" defaultTheme="system"`.
- **Theme attribute**: `data-theme` set on `<html>` server-side from a `theme` cookie (synced from `profiles.theme_id`) — no flash.
- **Fonts**: 10 families via `next/font/google` with `preload: false` and `variable: '--font-<id>'`; `<html>` gets the chosen font's class from a `font` cookie; CSS: `font-family: var(--font-active), 'Noto Sans JP', 'Noto Sans Myanmar', system-ui`. Noto Sans JP and Noto Sans Myanmar always loaded with `display: swap` and subset by unicode-range.
- **Text size**: `--font-scale` on `<html>` (0.93 / 1 / 1.13) → root `font-size`.
- **i18n**: `next-intl` without locale prefix; locale from `locale` cookie (synced from profile, default from `Accept-Language`). Messages in `src/i18n/messages/{en,my,ja}.json`. Dates/numbers through `next-intl` formatters with the user's timezone.
- **Contrast check**: a Vitest test computes contrast for every theme × mode token pair (≥ 4.5:1).

---

## 12. UI component map (shadcn/ui)

| Need | shadcn components |
| --- | --- |
| Bottom tabs / side nav | custom `BottomNav` using `Button` + `lucide-react` |
| Forms, inputs, OTP | `Form`, `Input`, `InputOTP`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioGroup`, `Label` |
| Sheets & dialogs | `Sheet` (bottom sheets: assign, delete), `Dialog`, `AlertDialog` (delete confirm), `Drawer` (mobile) |
| Menus | `DropdownMenu` (course ⋯), `ToggleGroup` (segmented controls), `Tabs` |
| Feedback | `Sonner` toasts, `Badge`, `Progress`, `Skeleton`, `Tooltip` |
| Data | `Card`, `Avatar`, `Calendar` (react-day-picker), `Separator`, `ScrollArea` |

Markdown editing: `@uiw/react-md-editor` wrapped in `LessonEditor` (dynamic import, theme follows `data-color-mode` from next-themes, toolbar trimmed to heading, bold, italic, list, quote, link, image, code; image/audio buttons upload to Storage then insert the URL).

Custom shared components: `Markdown`, `CalendarMonth` (with overnight shift bars), `DayBar` (24 h availability), `StatusChip`, `ProgressRing`, `TimeBoth` (her time · your time).

---

## 13. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| DB & RLS | pgTAP via `pnpm test:db` (dev project; `supabase test db` with local Docker) | Each policy: allowed + denied per role; functions `busy_segments`, `next_free_at`, `status_at`/`status_now`, `effective_due`, `request_join` |
| Guards | Vitest against the local database | every guard: allowed + denied cases (same matrix as the pgTAP RLS tests) |
| Logic | Vitest | `lib/time.ts`, `lib/availability.ts` (free gaps), progress forecast, rule evaluation |
| Components | Vitest + Testing Library | forms, OTP input, calendar rendering of overnight shifts |
| E2E | Playwright (390×844 + 1280×800) | one test per user story; offline mode via `context.setOffline(true)` |
| Accessibility | `@axe-core/playwright` | no serious violations on every page |
| Visual | Playwright screenshots vs `screenshots/` (manual review) | |

CI (GitHub Actions or GitLab CI): install (`prisma generate` on postinstall) → typecheck → lint → `supabase start` → `prisma migrate deploy` → `supabase test db` + Vitest → build → Playwright.

---

## 14. Security

- Prisma bypasses RLS: guards before every query (§6.1); a review checklist rejects any Route Handler or Server Action without a guard. RLS on every table remains for supabase-js access.
- Use a dedicated Postgres role for Prisma (Supabase docs: create a `prisma` user) instead of `postgres`, and keep `DATABASE_URL` server-only.
- Markdown sanitized (`rehype-sanitize`); no raw HTML.
- File uploads: type allow-list (images, pdf, audio), size limits, Storage policies by path.
- Content-Security-Policy via `next.config.ts` headers: self, Supabase URL, push endpoints; `frame-ancestors 'none'`.
- Auth: email confirmation required, OTP attempts limited, neutral reset messages, sign out other sessions on reset.
- Keep Next.js on the latest 16.x patch (security releases are scheduled; subscribe to advisories).

---

## 15. Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or anon key) | Next.js | client key |
| `SUPABASE_SECRET_KEY` (`sb_secret_…`) | Vercel (server only) + local e2e | Supabase Auth admin API: account deletion (`src/server/supabase-admin.ts`) and e2e fixtures. Never `NEXT_PUBLIC_`, never imported by client code |
| `DATABASE_URL` | Vercel (server only) | Prisma Client — Supabase transaction pooler, port 6543 |
| `DIRECT_URL` | CI / local (server only) | Prisma CLI migrations — session pooler or direct, port 5432 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Next.js | push subscribe |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Vercel (server only) | send push |
| `CRON_SECRET` | Vercel + Supabase Vault (for pg_cron) | authorize `/api/cron/dispatch` |
| `RESEND_API_KEY` | Supabase SMTP settings + Vercel | auth emails + weekly summary |
| `NEXT_PUBLIC_SITE_URL` | Next.js | auth redirects, invite links |

`.env.local` is git-ignored; production values live in Vercel and Supabase secrets.

---

## 16. Deployment

1. **Resend**: add and verify your sending domain (SPF, DKIM, DMARC records in DNS); create an API key.
2. **Supabase** (region close to Tokyo, e.g. `ap-northeast-1`):
   - Auth: Confirm email ON, OTP length 6, expiry 3600 s; email templates use `{{ .Token }}`.
   - Auth → SMTP: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender = your verified address.
   - Providers: Google, Apple. Hooks: Custom Access Token Hook → `custom_access_token_hook`.
   - Create a `prisma` database user; `DIRECT_URL=… pnpm prisma migrate deploy` (applies `0_init`); store `CRON_SECRET` in Vault; enable pg_cron + pg_net and schedule `/api/cron/dispatch` (SQL at the end of `0_init`).
3. **Vercel**:
   - Import the repo with Vercel's Git integration. If the repo lives on a self-managed GitLab that the integration can't reach, deploy from CI instead: `vercel pull`, `vercel build`, `vercel deploy --prebuilt` with a `VERCEL_TOKEN`.
   - Env vars per environment (Production / Preview / Development); `NEXT_PUBLIC_SITE_URL` = production domain.
   - Add the production domain (HTTPS required for service worker and push); add it and `https://*-<team>.vercel.app` to Supabase Auth → URL Configuration (redirect URLs) so preview deploys can sign in.
   - Region for functions: `hnd1` (Tokyo) to sit near Supabase.
4. Smoke test on Android Chrome, iPhone Safari (installed to Home Screen), desktop Chrome.

## 17. Feature → technical mapping

| Spec | Main routes | DB objects | Notable tech |
| --- | --- | --- | --- |
| 001 auth | `(auth)/*`, `/join/[code]`, `/a/welcome`, `/s/me` | profiles, admin_invites, student_links, `request_join`, token hook | `@supabase/ssr`, `proxy.ts`, InputOTP |
| 002 courses | `/a/courses/**`, `/s/courses/**`, `/s/lessons/[id]` | courses, course_sections, lessons, lesson_resources, Storage | react-markdown, dnd-kit, soft delete |
| 003 assign | `/a/courses/[id]` assign sheet, `/a/plan`, `/s/today` | course_assignments, lesson_deadlines, `effective_due` | DayBar, drag deadlines |
| 004 progress | `/s/lessons/[id]`, `/s/progress`, `/a/students` | lesson_progress, submissions, comments, study_sessions, `course_progress` | optimistic updates, Realtime |
| 005 shifts | `/s/shifts/**`, `/a/plan`, `/a/students` | shifts, shift_patterns, `busy_segments`, `next_free_at`, `status_now` | exclusion constraint, overnight math |
| 006 notifications | `/a/alerts/**`, `/s/me/reminders` | notification_rules, scheduled_messages(+recipients), push_subscriptions, notifications | pg_cron → `/api/cron/dispatch`, web-push, Resend |
| 007 appearance | `/s/me/appearance` (also admin) | profiles columns | next-themes, CSS variables, next/font, next-intl |
| 008 pwa | global | – | Serwist, Dexie queue, persisted TanStack Query |

---

## 18. Technical decisions

| Decision | Choice | Status |
| --- | --- | --- |
| Data fetching | TanStack Query v5 → Route Handlers (reads) / Server Actions (writes) | Decided |
| ORM | Prisma 7 + guards; RLS kept for Realtime/Storage | Decided |
| Migrations | Prisma `migrate diff` + `migrate deploy` (no shadow DB) | Decided |
| Markdown editor | `@uiw/react-md-editor` | Decided |
| Email provider | Resend (Supabase SMTP + API) | Decided |
| Hosting | Vercel (+ Supabase Cloud) | Decided |
| Monitoring | Sentry | Optional, later |
