import 'server-only'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, TIMEZONE_COOKIE, hasLocale, isTimeZone } from '@/i18n/locales'
import { APPEARANCE_COOKIE, serializeAppearance, type Appearance } from '@/lib/appearance'

const YEAR = 60 * 60 * 24 * 365

/**
 * Mirror the user's language, time zone and look into cookies: src/i18n/request.ts reads the first
 * two, the root layout's pre-paint script the look (spec 007 research R1).
 */
export async function setPreferenceCookies(prefs: {
  locale?: string
  timezone?: string
  appearance?: Appearance
}) {
  const store = await cookies()
  const options = { path: '/', maxAge: YEAR, sameSite: 'lax' as const }
  if (hasLocale(prefs.locale)) store.set(LOCALE_COOKIE, prefs.locale, options)
  if (isTimeZone(prefs.timezone)) store.set(TIMEZONE_COOKIE, prefs.timezone, options)
  if (prefs.appearance) {
    store.set(APPEARANCE_COOKIE, serializeAppearance(prefs.appearance), options)
  }
}
