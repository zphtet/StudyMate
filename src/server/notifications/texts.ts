import 'server-only'
import { createFormatter, createTranslator } from 'next-intl'
import { hasLocale, type Locale } from '@/i18n/locales'

// Notice texts in the RECIPIENT's language, with times in the recipient's zone (spec 003 FR-012,
// spec 004 FR-009). The recipient reads them later (006 delivers). createTranslator works outside a
// request (Server Actions, tests), unlike getTranslations, which reads the viewer's cookies.

export type NoticeRecipient = { id: string; locale: string; timezone: string }

export async function textsFor(recipient: NoticeRecipient) {
  const locale: Locale = hasLocale(recipient.locale) ? recipient.locale : 'en'
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'notices' })
  const format = createFormatter({ locale, timeZone: recipient.timezone })
  const when = (at: Date) =>
    format.dateTime(at, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  return { t, when }
}
