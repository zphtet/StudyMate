# Quickstart: Installable PWA and Offline Use

How to check 008 end to end. Details live in [data-model.md](data-model.md) and [contracts/](contracts/).

## 1. Prerequisites

- `.env` points at the dev Supabase project, as for 001–007. No new environment variables. The worker revision uses the git SHA, or `VERCEL_GIT_COMMIT_SHA` on Vercel.
- New packages, pinned:
  - `serwist`, `@serwist/turbopack`, `dexie`, `@tanstack/react-query-persist-client`;
  - dev: `esbuild`, `fake-indexeddb`.
- Seeded users May (student, Tokyo, with an active course that has an image and a PDF) and Zin (Admin) from the e2e fixtures.
- **The service worker only runs in a production build.** `pnpm dev` never registers it (R1).

## 2. Apply and check the database

```bash
pnpm prisma migrate deploy      # <ts>_offline_versions: submissions.client_op_id, shifts.updated_at
pnpm prisma generate
pnpm test:db                    # + supabase/tests/008_offline_versions.test.sql
```

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test        # outbox, coalescing, rebase, accepted time, eviction, install visits, persister,
                 # sync-ops per op (dev DB), /api/sync guard
rm -rf .next/cache && pnpm build && PORT=3100 pnpm start
PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e tests/e2e/us1-install.spec.ts tests/e2e/us2-offline.spec.ts tests/e2e/us3-update.spec.ts
```

Before running Playwright:
- Leave the dev server on :3000 alone.
- Check that no other session is using :3100 or the dev DB.
- While developing, run one smoke test per story; run the full specs at the gate.

## 4. Manual scenarios (390×844 first, production build)

| # | Do | Expect |
| --- | --- | --- |
| 1 | Chrome DevTools → Application → Manifest | Name, icons 192/512 + maskable, standalone, no installability errors. Service worker `/serwist/sw.js` active, scope `/` |
| 2 | Open the app, close the tab, open it again | "Install StudyMate" sheet on the 2nd visit. Not now → gone. Set the clock +15 days → back |
| 3 | Safari on iPhone (or iOS user agent in DevTools) | Steps sheet with Share → Add to Home Screen instead of an Install button |
| 4 | Install, open from the home screen | Standalone, app icon and name. Tab bar clears the home bar. Top bar clears the notch. Status bar follows Light/Dark |
| 5 | As May, open a course online, wait a few seconds, then DevTools → Network → Offline | Banner "Offline — changes will sync". Every lesson of that course opens with its image and PDF. YouTube shows "Video needs a connection". A course never opened → `/~offline` or its last cached list |
| 6 | Offline: mark a lesson complete; write a draft and add a photo; Submit another lesson | "Will sync" pills, "Will submit". Banner shows "3 waiting" |
| 7 | Offline: add a shift; try Rotation | Shift saved with "Will sync". Rotation's Save is disabled with "Needs a connection" |
| 8 | Wait a few minutes, go back online | Banner "Syncing…" then gone. Progress shows the completion at the offline time. The submission's submitted time is the press time. The shift is on the server (refresh) |
| 9 | Offline, edit a draft; meanwhile as Zin (other browser) … or as May on another device, edit the same draft; then reconnect | Toast "1 change wasn't saved". The sheet shows the lesson, "Changed on another device" and the offline text with Copy. The server text is unchanged |
| 10 | Offline, complete a lesson; as Zin delete that lesson; reconnect | Dropped with "This lesson is no longer available" |
| 11 | As Zin, go offline | "Offline — showing saved data". Editors' Save buttons disabled with "Needs a connection". Lists still show |
| 12 | Offline with 2 waiting changes, Me → Sign out | Confirm "2 changes not synced yet — sign out anyway?". Cancel keeps the session. Sign out → Application → IndexedDB `studymate` gone, `pages`/`media` caches gone |
| 13 | Deploy or rebuild with a change while the app is open with a half-written draft | "Update ready — Reload" toast. Nothing reloads by itself. The draft text stays. Reload → new version |
| 14 | Turn reminders on (006), send a test push, go offline, tap it | Opens the cached lesson, or `/~offline` if it was never opened |
| 15 | DevTools → Application → Storage → simulate a low quota, open several courses | Least recently opened course's media are removed first; the current one stays |

## 5. Performance (SC-001, SC-002)

- Lighthouse (mobile) on `/s/today` of the production build: performance ≥ 90. Installability: no errors in the Manifest panel (Lighthouse 12 has no PWA category; R16).
- Cold start of the installed app with the cache warm, Moto G Power profile (4× CPU, Slow 4G): Today usable < 2 s. Measure with the Performance panel, from the start to the first Today card with data from the persisted cache.

## 6. Done means

The us1–us3 Playwright specs pass; the guard, sync-ops and pgTAP tests pass; typecheck and lint are clean; the banner, sheets and pills fit at 390×844 in all 3 languages at Large text; `specs/008-pwa-offline/spec.md` Status → Implemented.
