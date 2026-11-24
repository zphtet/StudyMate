'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'
import {
  appearanceCookieString,
  applyAppearance,
  parseAppearanceCookie,
  serializeAppearance,
  type Appearance,
} from '@/lib/appearance'

/**
 * Spec 007 research R3 (clarification Q4): the account's look, from the signed-in layout, wins over
 * this device's `appearance` cookie. When they differ (changed on another device), the device
 * switches once on this open and keeps the new look in its cookie, so the next open is right from
 * the first frame. Replaces 001's ThemeSync, which did this for the mode only.
 */
export function AppearanceSync({ appearance }: { appearance: Appearance }) {
  const { setTheme } = useTheme()
  const saved = serializeAppearance(appearance)
  useEffect(() => {
    if (serializeAppearance(parseAppearanceCookie(document.cookie)) === saved) return
    document.cookie = appearanceCookieString(appearance)
    applyAppearance(document, appearance)
    setTheme(appearance.colorMode)
    // Only when the account's look changes, not on every render or local change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])
  return null
}
