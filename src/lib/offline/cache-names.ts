// Cache Storage names the service worker writes and sign-out deletes (spec 008 research R2, R11).
// Shared by src/app/sw.ts and the page side, so the two never disagree.

export const CACHE = {
  pages: 'pages',
  rsc: 'pages-rsc',
  rscPrefetch: 'pages-rsc-prefetch',
  media: 'media',
  assets: 'assets',
} as const

/** Per-user caches: everything but the precache and static assets (R11). */
export const USER_CACHES = [CACHE.pages, CACHE.rsc, CACHE.rscPrefetch, CACHE.media] as const

/** Lesson files and submission images, served from stable same-origin URLs (R2). */
export function isMediaPath(pathname: string) {
  return (
    pathname.startsWith('/api/lesson-files/') ||
    /^\/api\/submissions\/[^/]+\/files\//.test(pathname)
  )
}
