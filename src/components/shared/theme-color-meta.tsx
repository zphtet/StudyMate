'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'
import { barColor } from '@/lib/appearance'

/**
 * Spec 007 FR-015, research R10: the browser and status bar follow Light or Dark. The server
 * renders two theme-color tags, one per OS colour scheme, which is right for Auto; an explicit Light
 * or Dark choice has to win whichever scheme the OS reports, so both tags get the resolved colour.
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', barColor[resolvedTheme])
    }
  }, [resolvedTheme])
  return null
}
