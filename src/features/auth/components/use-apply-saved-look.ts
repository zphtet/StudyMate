'use client'

import { useTheme } from 'next-themes'
import { applyAppearance, parseAppearanceCookie } from '@/lib/appearance'

/**
 * Spec 007 research R1, US3 scenario 3: sign-in and code verification set the account's
 * `appearance` cookie, then move on with a client-side navigation, which doesn't re-run the
 * pre-paint script. Applying the cookie here first means the first screen after sign-in already
 * has the account's look.
 */
export function useApplySavedLook() {
  const { setTheme } = useTheme()
  return () => {
    const look = parseAppearanceCookie(document.cookie)
    applyAppearance(document, look)
    setTheme(look.colorMode)
  }
}
