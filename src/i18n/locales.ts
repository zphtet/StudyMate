// Supported languages (constitution VI; data-model.md › Profile.locale). No i18n routing: the
// locale lives in a cookie (research R8), synced from profiles.locale when signed in.

export const locales = ['en', 'my', 'ja'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export const LOCALE_COOKIE = 'locale'
export const TIMEZONE_COOKIE = 'tz'

/** Shown in each language's own script so people can find theirs. */
export const localeNames: Record<Locale, string> = { en: 'English', my: 'မြန်မာ', ja: '日本語' }

export const hasLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value)

/** Best supported match for an Accept-Language header, e.g. "ja-JP,ja;q=0.9,en;q=0.8". */
export function matchAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return defaultLocale
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q.split('=')[1]) : 1 }
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q)
  return (ranked.find((x) => hasLocale(x.lang))?.lang as Locale | undefined) ?? defaultLocale
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}
