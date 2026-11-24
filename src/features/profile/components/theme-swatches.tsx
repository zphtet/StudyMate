'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { themes, type ThemeId } from '@/lib/appearance'
import { cn } from '@/lib/utils'

/**
 * Colour theme (12-Appearance.png; contracts/ui-routes.md): 10 named swatches, five per row. Each
 * swatch shows its own theme's colour whatever the current theme, so its fill comes from the theme
 * list (research R4), not a token. 44 px, not the screenshot's 36 px (constitution V).
 */
export function ThemeSwatches({
  value,
  onChange,
}: {
  value: ThemeId
  onChange: (id: ThemeId) => void
}) {
  const t = useTranslations('appearance')
  // Each choice saves itself, which needs the server (spec 008 R14).
  const connection = useNeedsConnection()
  return (
    <div
      role="radiogroup"
      aria-label={t('colourTheme', { name: t(`themes.${value}`) })}
      className="grid grid-cols-5 gap-x-2 gap-y-4"
    >
      {themes.map(({ id, swatch }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={connection.disabled}
            aria-describedby={connection.describedBy}
            onClick={() => !active && onChange(id)}
            className="group flex min-w-0 flex-col items-center gap-2 rounded-xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-background',
                active && 'ring-2',
              )}
              style={{ backgroundColor: swatch, ['--tw-ring-color' as string]: swatch }}
              aria-hidden
            >
              {active && <Check className="size-5 text-white" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                // Wrap, don't truncate, at Large text (spec Edge Cases).
                'w-full text-center text-sm leading-tight [overflow-wrap:anywhere] hyphens-auto',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {t(`themes.${id}`)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
