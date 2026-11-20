'use client'

import { ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setLocale } from '@/features/auth/actions'
import { hasLocale, localeNames, locales } from '@/i18n/locales'

export function LanguageSwitcher() {
  const t = useTranslations('common')
  const current = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const change = (value: string) => {
    if (!hasLocale(value) || value === current) return
    startTransition(async () => {
      await setLocale({ locale: value })
      document.documentElement.lang = value
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="touch"
          className="rounded-full px-5"
          aria-label={`${t('language')}: ${hasLocale(current) ? localeNames[current] : current}`}
          disabled={pending}
        >
          {hasLocale(current) ? localeNames[current] : current}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={current} onValueChange={change}>
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} lang={locale} className="min-h-11">
              {localeNames[locale]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
