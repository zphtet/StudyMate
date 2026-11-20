'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Palette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { setColorMode } from '../actions'
import { meQuery } from '../queries'
import type { ColorMode } from '../schemas'

// Appearance (screen 12-Appearance). 001 ships Mode only (owner decision 2026-11-20);
// colour themes, fonts and text size come with feature 007.
export function AppearanceView() {
  const t = useTranslations('appearance')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { data: me } = useSuspenseQuery(meQuery)
  const { setTheme } = useTheme()

  const save = useMutation({
    mutationFn: async (colorMode: ColorMode) => unwrap(await setColorMode({ colorMode })),
    onMutate: (colorMode) => {
      setTheme(colorMode) // apply instantly; the profile keeps it for other devices
      queryClient.setQueryData(meQuery.queryKey, (old) => (old ? { ...old, colorMode } : old))
    },
    onError: (error) => {
      toast.error(errorMessage(error))
      queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
    },
  })

  const options: { value: ColorMode; label: string }[] = [
    { value: 'light', label: t('light') },
    { value: 'dark', label: t('dark') },
    { value: 'system', label: t('auto') },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-muted-foreground">{t('mode')}</h2>
        <div
          role="radiogroup"
          aria-label={t('mode')}
          className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1.5"
        >
          {options.map(({ value, label }) => {
            const active = me.colorMode === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => !active && save.mutate(value)}
                className={cn(
                  'min-h-12 rounded-xl text-lg font-medium transition-colors',
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-muted-foreground">
        <Palette className="mt-0.5 size-5 shrink-0" aria-hidden />
        {t('more')}
      </p>
    </div>
  )
}
