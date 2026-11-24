'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setLocale } from '@/features/auth/actions'
import { localeNames, locales, type Locale } from '@/i18n/locales'
import { cn } from '@/lib/utils'
import { useNeedsConnection } from './use-needs-connection'

// Language on Me (screen 11-Profile): three buttons, each in its own script.
export function LanguageButtons({ label }: { label: string }) {
  const current = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()
  // The language is saved to the account, which needs the server (spec 008 R14).
  const connection = useNeedsConnection()

  const choose = (locale: Locale) => {
    if (locale === current) return
    startTransition(async () => {
      await setLocale({ locale })
      document.documentElement.lang = locale
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      router.refresh()
    })
  }

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-3">
      {locales.map((locale) => {
        const active = locale === current
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={active}
            lang={locale}
            disabled={connection.disabled || pending}
            aria-describedby={connection.describedBy}
            onClick={() => choose(locale)}
            className={cn(
              'min-h-13 rounded-lg border-2 bg-card px-2 text-lg font-medium transition-colors disabled:opacity-60',
              active ? 'border-primary bg-accent text-primary' : 'border-border hover:border-input',
            )}
          >
            {localeNames[locale]}
          </button>
        )
      })}
    </div>
  )
}
