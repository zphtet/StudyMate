'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'

/**
 * Applies the colour mode saved on the profile (spec 007 FR-001) when it differs from this
 * device's, e.g. after choosing Dark on another phone. Rendered by the signed-in shells.
 */
export function ThemeSync({ mode }: { mode: string }) {
  const { theme, setTheme } = useTheme()
  useEffect(() => {
    if (theme && theme !== mode) setTheme(mode)
    // Only when the saved mode changes, not on every local toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])
  return null
}
