'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
            onClick={() => !active && onChange(id)}
            className="group flex min-w-0 flex-col items-center gap-2 rounded-xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                'w-full truncate text-center text-sm',
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
