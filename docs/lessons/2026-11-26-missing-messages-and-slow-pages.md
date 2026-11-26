# Missing messages and slow pages (2026-11-26)

Two problems on the deployed site (study-mate-one-alpha.vercel.app), what caused them, how they were found, and what was changed. Each part ends with the general lesson.

- [Part 1 — A scheduled message never arrived](#part-1--a-scheduled-message-never-arrived)
- [Part 2 — Every tab click took 1.3–2.4 s](#part-2--every-tab-click-took-1324-s)
- [Checklist for next time](#checklist-for-next-time)

---

## Part 1 — A scheduled message never arrived

### Symptom
The admin scheduled a message for 17:43. The admin's Reminders screen listed it, but the student's Notifications never showed it. Messages sent earlier had arrived.

### How scheduled messages are sent
Saving a scheduled message only writes a row in the database. Something has to come back later and send it. In StudyMate that "something" is a timer inside Supabase:

```
pg_cron (every 5 min)  ──►  pg_net: HTTP POST  ──►  /api/cron/dispatch on Vercel  ──►  web push / email
   (Postgres timer)         (Postgres HTTP client)       (checks CRON_SECRET, sends what's due)
```

Why not Vercel Cron? On the Hobby plan, Vercel cron jobs run at most once a day, so StudyMate uses Supabase's `pg_cron` instead (technical spec §9).

Three pieces must all work:
1. `pg_cron`, the timer, must be installed and the job scheduled.
2. `pg_net`, which lets SQL make HTTP requests, must be installed.
3. The secret in Supabase Vault must match `CRON_SECRET` in Vercel, or the route answers 401.

### How it was diagnosed
Instead of guessing, ask the database what the timer did. `pg_cron` logs every run:

```sql
-- Is the job there and active?
select jobid, jobname, schedule, active from cron.job;

-- What happened on its recent runs?
select status, return_message, start_time
from cron.job_run_details order by start_time desc limit 5;
```

Result: **276 runs, all `failed`**, each with:

```
ERROR:  schema "net" does not exist
```

`net` is the schema the `pg_net` extension creates. Checking the extensions confirmed it:

```sql
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
-- only pg_cron came back
```

The timer ran every 5 minutes, but failed at the first line (`net.http_post(...)`), so the dispatcher was never called.

> Why did the earlier messages arrive? They were from Nov 24, before this cron job existed. They were most likely sent by `pnpm dispatch:watch` on the laptop, which calls the dispatcher every minute. Local and deployed share the same database, so the dispatcher's sends showed up on the deployed site too.

### Fix 1: enable pg_net

```sql
create extension if not exists pg_net;
```

The next run `succeeded`. But `pg_net` records each HTTP response, so we looked at that too:

```sql
select status_code, content, created
from net._http_response order by created desc limit 5;
-- 401 {"error":{"code":"unauthenticated"}}
```

### Fix 2 (still open): the secret in Vault was the placeholder
A 401 means the route rejected the secret. The setup SQL in the docs reads:

```sql
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
```

and it had been run **as written**, so Vault held the literal text `<CRON_SECRET>`. To check without printing the secret, we compared lengths and hashes:

| Value | Length | sha256 (first 12) |
|---|---|---|
| Vault `cron_secret` | 13 | `e4f275cc8f43` |
| the string `<CRON_SECRET>` | 13 | `e4f275cc8f43` ← same |
| local `CRON_SECRET` | 64 | `1c5d2a36d9cf` |

The fix is to store the real value, the one Vercel has:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  '<the real CRON_SECRET from Vercel>'
);
```

Then `net._http_response` should show `200` with the dispatcher's counts.

### Lessons
- **Background jobs fail silently.** Nothing in the app told anyone that 276 runs had failed. Look at the job's own log (`cron.job_run_details`) first.
- **Follow the chain one link at a time:** timer → HTTP call → auth → the code. Each link has its own place to check.
- **Placeholders in setup docs get pasted as-is.** Hashing two values is a safe way to tell whether they're equal without showing a secret.

---

## Part 2 — Every tab click took 1.3–2.4 s

### Symptom (from a browser review)
- Every tab click showed the loading skeleton for 1.3–2.4 s, even when going back to a tab just visited.
- After a page loaded, the browser also called `/api/today`, `/api/progress`, … so data seemed to be loaded twice.
- `x-vercel-id: fra1::iad1`: the server code ran in **iad1** (Washington DC).
- `/manifest.webmanifest` was downloaded again on every click.

### How it was diagnosed
Two rules: **measure before changing**, and **check what the code already does**.

1. **Read the code first.** Several of the review's suggestions were already in place:
   - `requireUser()` is wrapped in React `cache()`, so the user is checked once per request ([guards.ts](../../src/server/auth/guards.ts)).
   - The proxy uses `getClaims()`, which verifies the token locally. The project signs JWTs with ES256 keys, which we confirmed via `/auth/v1/.well-known/jwks.json`.
   - The browser has one shared `QueryClient` ([client.ts](../../src/lib/query/client.ts)).
   - The server reads the data and passes it to the client with `Prefetched` ([prefetch.tsx](../../src/lib/query/prefetch.tsx)).
   - No N+1 queries (no `await prisma` inside loops).
2. **Measure on a production build.** `pnpm build && pnpm start -p 3100`, then a throwaway Playwright test that signs in a student, clicks through the tabs, and logs every request with its timing:

```ts
page.on('request', (r) => {
  const u = new URL(r.url())
  const isRsc = Boolean(r.headers()['rsc'])          // a Next.js page (RSC) request
  if (u.pathname.startsWith('/api/') || isRsc) log.push(`${r.method()} ${u.pathname}`)
})
page.on('requestfinished', (r) => {
  const t = r.timing()                                // ms from request start
  log.push(`done ${new URL(r.url()).pathname}: ${Math.round(t.responseEnd)}ms`)
})
```

What it showed (before the fixes):

| Action | Requests | Time |
|---|---|---|
| Click Today | 1 page request | ~1.1 s |
| Click Courses | 1 page request | ~0.9–1.0 s |
| Click Progress | 1 page request | ~0.5 s |
| Go back to Today **after 31 s** | page request **+ 4 `/api` calls** (`/api/today`, `/api/shifts/today`, `/api/progress/summary`, `/api/notifications/unread`) | 2.8 s + ~1.2 s each |

So there were four separate problems.

### Issue 1: the server was far from the database (the biggest cause)

The database and Supabase Auth are in Tokyo (`ap-northeast-1`, visible in `DATABASE_URL`). Vercel ran the functions in Washington (`iad1`), its default region.

One request to Today runs about 8–10 database and auth calls, **one after another**. Some depend on each other: first who is the user, then whether they have an admin link, then today's lessons, and so on.

```
Washington → Tokyo → Washington ≈ 150 ms per call
10 calls in a row × 150 ms ≈ 1.5 s   ← most of the 1.3–2.4 s
```

In Tokyo next to the database, each call takes a few ms. Your browser still has to reach Tokyo, but only **once** per click, not ten times.

**Fix:** [vercel.json](../../vercel.json)
```json
"regions": ["hnd1"]
```
The technical spec (§16) already said `hnd1`; the deploy had never set it. Confirmed after deploy: `x-vercel-id: sin1::hnd1::…`, meaning the request entered at the Singapore edge and the function ran in Tokyo.

> **Lesson:** latency × number of *sequential* round trips is often the whole story. Put the server next to the database, not next to the user, when a request makes many database calls.

> Why not `sin1` (Singapore), closer to Myanmar? Then you pay Singapore↔Tokyo (~70 ms) on *each* of the ~10 database calls, instead of Myanmar↔Tokyo once.

### Issue 2: going back to a tab always asked the server again

Next.js keeps visited pages in a client-side **router cache**. For dynamic pages (ones that read cookies, like every signed-in page), Next 15+ keeps them for **0 seconds** by default. So going back to a tab requested the page from the server again and showed the `loading.tsx` skeleton every time.

**Fix:** [next.config.ts](../../next.config.ts)
```ts
experimental: {
  staleTimes: { dynamic: 30 },   // reuse a visited dynamic page for 30 s
},
```

**Isn't cached data a risk after an edit?** We checked:
- Screens read their data from TanStack Query, and every mutation invalidates its queries, so edits show at once.
- An older copy of the data inside a cached page never overwrites newer data. TanStack's `hydrate` only replaces data that is older.
- The few things the server draws directly (the name and time zone) are edited in the profile sheet, which already calls `router.refresh()`. That clears the router cache.

`static` was left at its 5-minute default. Setting it to 180 would also have shortened link prefetching.

**Result:** going back to a tab within 30 s makes **no request at all** and shows no skeleton.

### Issue 3: data loaded twice when going back after 30 s

This was the subtle one. StudyMate's pattern (research R12) is:

1. The server reads the data and puts it in the page (`Prefetched` → `HydrationBoundary`).
2. A client component reads it with `useQuery`, which keeps it fresh afterwards.

On a **first** visit there was no duplicate: the query isn't in the cache yet, so `HydrationBoundary` adds the server's data before the component renders.

On a **revisit**, the query *is* already in the cache, holding the copy from the first visit. TanStack Query v5 deliberately applies new data to an **existing** query in an effect, **after** render, to avoid updating the cache in the middle of rendering. So:

```
revisit after 31 s
 ├─ page arrives with fresh data from the server (in HydrationBoundary)
 ├─ component renders → useQuery sees the cached copy from the first visit
 │     its age (31 s) > staleTime (30 s) → "stale" → fetch /api/today   ← duplicate
 └─ effect runs → the server's fresh data is applied (too late to stop the fetch)
```

**Fix:** [client.ts](../../src/lib/query/client.ts): `staleTime: 30_000` → `staleTime: 5 * 60_000`.

Every page navigation already brings fresh data from the server, so the client doesn't need to fetch it again soon. Mutations still invalidate at once.

**Trade-off:** a change made by *someone else* (e.g. the admin) shows on your next page visit, not when you switch back to the browser tab. After 5 minutes, focusing the tab refetches again.

**Result:** going back after 31 s makes one page request and **no** `/api` calls.

> **Lesson:** "seed on the server + `useQuery` on the client" is a good pattern, but `staleTime` must be longer than the gap between a navigation and the hydration effect. A very short `staleTime` turns every revisit into two loads.

### Issue 4: the manifest was re-checked on every click

`app/manifest.ts` is served at `/manifest.webmanifest` with `Cache-Control: public, max-age=0, must-revalidate`, which tells the browser to ask the server again every time.

**Fix:** [next.config.ts](../../next.config.ts)
```ts
{ source: '/manifest.webmanifest',
  headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },  // 1 day
```
Production now returns `max-age=86400`. Trade-off: a changed manifest reaches browsers within a day.

### What was looked at but deliberately not changed

| Suggestion | Why not (now) |
|---|---|
| Replace `getUser()` with `getClaims()` in `requireUser()` | `getUser()` asks Supabase Auth, so a signed-out or banned user is rejected at once. `getClaims()` only checks the token, which stays valid up to 1 h, and the token doesn't say whether the email is confirmed. In Tokyo, `getUser()` costs ~5 ms, so it's not worth the weaker check. |
| Run Today's queries in parallel | The summary and shift banner start only after Today's lessons load (they render inside `TodayView`). Worth fixing only if Today is still slow now that each call takes a few ms. Measure first. |
| Paint the nav before the auth check | The menu needs the user's language (a cookie) and sits behind the student layout's auth and link check. Changing that touches sign-in and language behaviour. In Tokyo the check is fast. |
| Pick one data method per page | The server-seed + client-query pattern is needed for offline use (spec 008: the data cache is saved on the device). The duplicate came from `staleTime`, not from the pattern. |

### Commits
| Commit | Change |
|---|---|
| `8b0a26f` | Run Vercel functions in hnd1 (Tokyo), next to Supabase |
| `e06495c` | Reuse a visited page for 30 s (`staleTimes.dynamic`) |
| `6c85167` | Keep query data fresh for 5 min so revisits don't load it twice |
| `b8e80f3` | Cache the web app manifest for a day |

---

## Checklist for next time

**Something scheduled didn't happen**
1. `select * from cron.job;`: is the job there and active?
2. `select status, return_message from cron.job_run_details order by start_time desc limit 5;`: did it run, and did it fail?
3. `select status_code, content from net._http_response order by created desc limit 5;`: what did the HTTP call get back? A 401 means the secret is wrong.

**A page is slow**
1. Check `x-vercel-id` in the response headers: where did the function run (the part after `::`)? Is that near the database?
2. Count the database calls a page makes **in a row**, and multiply by the round-trip time.
3. Measure on a production build (`pnpm build && pnpm start`), not `pnpm dev`, which compiles on demand.
4. Log the page's requests in the browser or Playwright. Look for the same data fetched twice (a page request *and* an `/api` call).
5. Check the response's `Cache-Control` for anything downloaded on every click.
6. Read what the code already does before applying generic advice. Half of the review's suggestions were already in place.
