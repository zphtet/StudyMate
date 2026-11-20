import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import {
  LOCALE_COOKIE,
  TIMEZONE_COOKIE,
  hasLocale,
  isTimeZone,
  matchAcceptLanguage,
} from './locales'

// Locale: `locale` cookie → Accept-Language → en (research R8). Time zone: the viewer's own
// (`tz` cookie, written on sign-in and profile changes), so times show in their zone (constitution IV).
export default getRequestConfig(async () => {
  const store = await cookies()
  const fromCookie = store.get(LOCALE_COOKIE)?.value
  const locale = hasLocale(fromCookie)
    ? fromCookie
    : matchAcceptLanguage((await headers()).get('accept-language'))
  const tz = store.get(TIMEZONE_COOKIE)?.value

  return {
    locale,
    timeZone: isTimeZone(tz) ? tz : 'UTC',
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
