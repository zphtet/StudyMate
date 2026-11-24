import type { MetadataRoute } from 'next'

// Spec 008 FR-001 (contracts/service-worker.md › Manifest). The colours are the light theme's
// background: a manifest can't follow the mode, so 007's ThemeColorMeta sets the live bar colour.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'StudyMate',
    short_name: 'StudyMate',
    description: 'Plan lessons. Study a little every day.',
    // The proxy sends each role to its home (/s/today or /a/students).
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fafaf9',
    theme_color: '#fafaf9',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
