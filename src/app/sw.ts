/// <reference lib="webworker" />
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
  type SerwistPlugin,
} from 'serwist'
import { CACHE, isMediaPath } from '@/lib/offline/cache-names'
import type { WorkerReply, WorkerRequest } from '@/lib/offline/worker-messages'

// StudyMate's service worker (spec 008 research R1, R2; contracts/service-worker.md). Built by
// src/app/serwist/[path]/route.ts and served at /serwist/sw.js with scope /.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const DAY = 24 * 60 * 60

/**
 * The file routes redirect to a 1-hour signed Storage URL. Fetch them in CORS mode so the cached
 * copy is a real response, not an opaque one that Chrome counts as ~7 MB (R2), and drop the
 * `redirected` flag so the copy can also answer a navigation (opening a PDF).
 */
const corsMedia: SerwistPlugin = {
  requestWillFetch: async ({ request }) =>
    new Request(request.url, { mode: 'cors', credentials: 'same-origin' }),
  fetchDidSucceed: async ({ response }) =>
    response.redirected
      ? new Response(response.body, { status: response.status, headers: response.headers })
      : response,
}

const isDocument = (request: Request) =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  (request.headers.get('Accept')?.includes('text/html') ?? false)

// R2's table, top to bottom. Not Serwist's defaultCache: it also caches /api JSON and cross-origin
// responses (signed URLs), and files navigations under "others".
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && isMediaPath(url.pathname),
    method: 'GET',
    handler: new CacheFirst({
      cacheName: CACHE.media,
      plugins: [
        corsMedia,
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true }),
      ],
    }),
  },
  // The persisted query cache owns data (R4); Supabase and YouTube are never cached.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
  { matcher: ({ sameOrigin }) => !sameOrigin, handler: new NetworkOnly() },
  {
    matcher: ({ request }) =>
      request.headers.get('RSC') === '1' && request.headers.get('Next-Router-Prefetch') === '1',
    handler: new NetworkFirst({
      cacheName: CACHE.rscPrefetch,
      networkTimeoutSeconds: 3,
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * DAY })],
    }),
  },
  {
    matcher: ({ request }) => request.headers.get('RSC') === '1',
    handler: new NetworkFirst({
      cacheName: CACHE.rsc,
      networkTimeoutSeconds: 3,
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * DAY })],
    }),
  },
  {
    matcher: ({ request }) => isDocument(request),
    handler: new NetworkFirst({
      cacheName: CACHE.pages,
      networkTimeoutSeconds: 3,
      // Offline, /s/shifts/new?date=B can use the copy saved for ?date=A; pages that depend on the
      // query read it on the client too (spec 008 R2).
      matchOptions: { ignoreSearch: true },
      // Room for several kept courses' lesson pages (R3); eviction removes a course's pages.
      plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    matcher: /\.(?:js|css|woff2?|png|svg|ico|webp|jpg|jpeg)$/i,
    handler: new CacheFirst({
      cacheName: CACHE.assets,
      plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY })],
    }),
  },
]

// `next dev` serves this worker only when 006's reminders register it: cache nothing there, so
// development always sees fresh code (esbuild sets NODE_ENV from its minify flag).
const isProduction = process.env.NODE_ENV === 'production'

const serwist = new Serwist({
  precacheEntries: isProduction ? self.__SW_MANIFEST : [],
  // R13: a new version waits until the student taps Reload (Serwist handles SKIP_WAITING).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: isProduction ? runtimeCaching : [{ matcher: /.*/, handler: new NetworkOnly() }],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => isDocument(request) }],
  },
})

serwist.addEventListeners()

// ── Keep and forget (R3): the page asks the worker to store or drop a course's pages and files ──

async function keep(url: string, event: ExtendableEvent): Promise<WorkerReply> {
  // Lesson pages are fetched as documents so the pages rule stores them; files go to media.
  const isMedia = isMediaPath(new URL(url, self.location.origin).pathname)
  const request = new Request(url, { headers: isMedia ? {} : { Accept: 'text/html' } })
  try {
    const response = await serwist.handleRequest({ request, event })
    const bytes = response?.ok ? (await response.clone().blob()).size : 0
    return { type: 'KEPT', url, bytes, ok: Boolean(response?.ok) }
  } catch {
    return { type: 'KEPT', url, bytes: 0, ok: false }
  }
}

async function forget(urls: string[]) {
  const caches_ = await Promise.all([caches.open(CACHE.pages), caches.open(CACHE.media)])
  await Promise.all(urls.flatMap((url) => caches_.map((cache) => cache.delete(url))))
}

self.addEventListener('message', (event) => {
  const data = event.data as WorkerRequest | undefined
  const port = event.ports[0]
  if (data?.type === 'KEEP') {
    // One at a time, so warming never competes with what the student is doing (R3).
    event.waitUntil(
      data.urls.reduce(
        (done, url) => done.then(() => keep(url, event).then((reply) => port?.postMessage(reply))),
        Promise.resolve(),
      ),
    )
  } else if (data?.type === 'FORGET') {
    event.waitUntil(forget(data.urls).then(() => port?.postMessage({ type: 'FORGOT' })))
  }
})

// ── Push (spec 006 research R7; 008 FR-005): moved unchanged from public/sw.js ──

// The dispatcher sends { title, body, url, tag } (src/server/notifications/push.ts). `url` already
// carries ?n=<id>, so the app marks the item read when it opens.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'StudyMate', {
        body: data.body || '',
        tag: data.tag,
        data: { url: data.url || '/' },
      }),
      tellOpenWindows(),
    ]),
  )
})

// Focus a window of the app on the item's page, or open one. Offline, that navigation is answered
// from the pages cache or with /~offline (spec 008 Edge Cases).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (!open) return self.clients.openWindow(url)
      // navigate() fails on a window this worker doesn't control; open a new one then.
      return open
        .focus()
        .then((w) => w.navigate(url))
        .catch(() => self.clients.openWindow(url))
    }),
  )
})

// Open windows refresh the bell (spec 006 research R9).
function tellOpenWindows() {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((w) => w.postMessage({ type: 'notifications' })))
}
