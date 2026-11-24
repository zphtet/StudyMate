import type { NextConfig } from 'next'
import { withSerwist } from '@serwist/turbopack'
import createNextIntlPlugin from 'next-intl/plugin'

// next-intl without i18n routing: locale from a cookie (src/i18n/request.ts, research R8).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const isDev = process.env.NODE_ENV === 'development'
const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost')

/**
 * Spec 008 FR-006; research R15. `'unsafe-inline'` scripts: a nonce would make every document
 * request-bound under Cache Components, and Next's inline RSC scripts differ per page so they can't
 * be hashed. Files redirect to signed Storage URLs (img, audio); Realtime uses wss. No
 * `upgrade-insecure-requests`: Vercel already serves HTTPS only, and it would break the http
 * production build e2e runs against.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase.origin}`,
  `media-src 'self' blob: ${supabase.origin}`,
  "font-src 'self'",
  `connect-src 'self' ${supabase.origin} wss://${supabase.host}${isDev ? ' ws:' : ''}`,
  'frame-src https://www.youtube-nocookie.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // Browsers find a new worker on the next open (research R13).
        source: '/serwist/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ]
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

// Serwist builds the service worker with esbuild in a Route Handler (spec 008 research R1).
export default withSerwist(withNextIntl(nextConfig))
