import { createSerwistRoute } from '@serwist/turbopack'
import { buildRevision } from '@/lib/build-revision'

// Builds and serves the service worker (src/app/sw.ts) at /serwist/sw.js (spec 008 research R1).
// Cache Components forbids the segment-config exports Serwist returns (`dynamic`, `revalidate`,
// `dynamicParams`), and its GET reaches non-deterministic code, which would leave the route dynamic:
// on Vercel a request-time build has no .next/static to list for the precache. So the file is built
// inside `'use cache'`, which prerenders each generated path at build time.

const serwist = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision: buildRevision() }],
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
