import 'server-only'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, TIMEZONE_COOKIE, hasLocale, isTimeZone } from '@/i18n/locales'

const YEAR = 60 * 60 * 24 * 365

/** Mirror the user's language and time zone into cookies read by src/i18n/request.ts. */
export async function setPreferenceCookies(prefs: { locale?: string; timezone?: string }) {
  const store = await cookies()
  const options = { path: '/', maxAge: YEAR, sameSite: 'lax' as const }
  if (hasLocale(prefs.locale)) store.set(LOCALE_COOKIE, prefs.locale, options)
  if (isTimeZone(prefs.timezone)) store.set(TIMEZONE_COOKIE, prefs.timezone, options)
}
