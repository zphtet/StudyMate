import { spawnSync } from 'node:child_process'
import { createSerwistRoute } from '@serwist/turbopack'

// Builds and serves the service worker (src/app/sw.ts) at /serwist/sw.js (spec 008 research R1).
// Cache Components forbids the segment-config exports Serwist returns (`dynamic`, `revalidate`,
// `dynamicParams`), and its GET reaches non-deterministic code, which would leave the route dynamic:
// on Vercel a request-time build has no .next/static to list for the precache. So the file is built
// inside `'use cache'`, which prerenders each generated path at build time.

/** Changes the worker's bytes on every deploy, so browsers find the update (R1, R13). */
const revision =
  process.env.SW_REVISION ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() || 'unversioned')

const serwist = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
})

export const generateStaticParams = serwist.generateStaticParams

async function buildFile(path: Promise<string>) {
  'use cache'
  const file = await path
  const response = await serwist.GET(new Request(`http://localhost/serwist/${file}`), {
    params: Promise.resolve({ path: file }),
  })
  return { body: await response.text(), contentType: response.headers.get('Content-Type') ?? '' }
}

export async function GET(_request: Request, { params }: RouteContext<'/serwist/[path]'>) {
  const { body, contentType } = await buildFile(params.then((p) => p.path))
  return new Response(body, {
    headers: { 'Content-Type': contentType, 'Service-Worker-Allowed': '/' },
  })
}
