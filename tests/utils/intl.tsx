import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import en from '@/i18n/messages/en.json'

// Component tests render inside the English messages, like the app's root layout does.
export function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  )
}
