# Contract: service worker, manifest and headers

## Worker: `src/app/sw.ts` → `/serwist/sw.js` (scope `/`)

Built and served by `src/app/serwist/[path]/route.ts` (`createSerwistRoute`, research R1). Registered by `SerwistProvider` in the root layout, in production only.

| Concern | Behaviour |
| --- | --- |
| Precache | `self.__SW_MANIFEST` plus `/~offline` (revision = `SW_REVISION` ?? `VERCEL_GIT_COMMIT_SHA` ?? git SHA; research R1) |
| Lifecycle | `skipWaiting: false`, `clientsClaim: true`, `navigationPreload: true` |
| Runtime caching | research R2 table, own rules in order: `media`; `/api/*` and cross-origin NetworkOnly; RSC prefetch and RSC NetworkFirst 3 s (`pages-rsc-prefetch`, `pages-rsc`, 64 entries / 7 d); documents NetworkFirst 3 s (`pages`, 300 / 30 d); other static files CacheFirst (`assets`). Serwist's `defaultCache` is not used (T001) |
| `media` rule | matches same-origin `GET /api/lesson-files/*` and `/api/submissions/*/files/*`. CacheFirst. Network fetch is `new Request(url, { mode: 'cors', credentials: 'same-origin' })`; only status 200 is cached; ExpirationPlugin `maxEntries: 300`, `maxAgeSeconds: 30 d`, `purgeOnQuotaError: true` |
| Not cached | other `/api/*`, cross-origin requests, non-GET |
| Fallback | a `document` request with no network and no cached copy → `/~offline` |
| `message` `{ type: 'SKIP_WAITING' }` | `self.skipWaiting()` (R13) |
| `message` `{ type: 'KEEP', urls: string[] }` | fetches each URL through the matching rule, so it is stored (R3 warming); answers `{ type: 'KEPT', url, bytes }` per URL via the message port |
| `message` `{ type: 'FORGET', urls: string[] }` | deletes those URLs from `pages` and `media` (R3 eviction) |
| `push` | unchanged from 006's `public/sw.js`: `showNotification(title, { body, tag, data: { url } })`, then `postMessage({ type: 'notifications' })` to open windows |
| `notificationclick` | unchanged: focus a window and `navigate(url)`, or `openWindow(url)`. Offline, that navigation is answered from `pages` or with `/~offline` (spec edge case) |

`public/sw.js` is deleted. `SERVICE_WORKER_URL` in `src/lib/push-device.ts` becomes `/serwist/sw.js`. `useDeviceReminders` no longer registers the worker itself: it waits for `navigator.serviceWorker.ready`.

## `/~offline` page: `src/app/~offline/page.tsx`

A static page: app mark, "You're offline", "Pages you've opened before still work", and a link to `/`.
- Translated through next-intl with the `locale` cookie's language, via a pre-paint read as in 001.
- No data, so it works for both roles and signed out.

## Manifest: `src/app/manifest.ts`

```ts
{
  id: '/',
  name: 'StudyMate',
  short_name: 'StudyMate',
  description: 'Plan lessons. Study a little every day.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#fafaf9',
  theme_color: '#fafaf9',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
```

- The colours stay the light theme's background. The manifest can't follow the mode, and 007's `ThemeColorMeta` sets the live colour.
- The root layout adds:
  - `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'StudyMate' }`;
  - `icons.apple: '/icons/apple-touch-icon.png'` (180);
  - `viewport.viewportFit: 'cover'`.

## Headers: `next.config.ts` `headers()` (research R15)

For `/:path*`:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${SUPABASE_URL}; media-src 'self' blob: ${SUPABASE_URL}; font-src 'self'; connect-src 'self' ${SUPABASE_URL} wss://${SUPABASE_HOST}; frame-src https://www.youtube-nocookie.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (no `upgrade-insecure-requests`: research R15) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |

- `${SUPABASE_URL}` comes from `NEXT_PUBLIC_SUPABASE_URL` at build time.
- In development, `script-src` adds `'unsafe-eval'` (React's dev tooling) and `connect-src` adds `ws:` (HMR).
- For `/serwist/sw.js`: `Cache-Control: no-cache` (next.config.ts), so updates are found on the next open. `Service-Worker-Allowed: /` comes from the route.
