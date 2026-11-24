import type { NextConfig } from 'next'
import { withSerwist } from '@serwist/turbopack'
import createNextIntlPlugin from 'next-intl/plugin'

// next-intl without i18n routing: locale from a cookie (src/i18n/request.ts, research R8).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  cacheComponents: true,
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
