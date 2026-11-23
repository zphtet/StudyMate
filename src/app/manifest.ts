import type { MetadataRoute } from 'next'

// The minimum that lets iPhone users add StudyMate to the Home Screen, which iOS needs for push
// (spec 006 research R7). Spec 008 adds icons, shortcuts and the rest. Colours match the light
// theme's background in the root layout's viewport.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StudyMate',
    short_name: 'StudyMate',
    description: 'Plan lessons. Study a little every day.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#fafaf9',
  }
}
