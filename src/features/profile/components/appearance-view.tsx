'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { fontName, type ColorMode, type TextSize } from '@/lib/appearance'
import { meQuery } from '../queries'
import { AppearancePreview } from './appearance-preview'
import { FontTiles } from './font-tiles'
import { SegmentedChoice } from './segmented-choice'
import { ThemeSwatches } from './theme-swatches'
import { useAppearance } from './use-appearance'

// Appearance (screen 12-Appearance; spec 007 FR-002, contracts/ui-routes.md): the preview card,
// then Mode, Colour theme, Font and Text size. Every choice applies at once and saves itself.
export function AppearanceView() {
  const t = useTranslations('appearance')
  const { data: me } = useSuspenseQuery(meQuery)
  const { look, change } = useAppearance()

  const modes: { value: ColorMode; label: string }[] = [
    { value: 'light', label: t('light') },
    { value: 'dark', label: t('dark') },
    { value: 'system', label: t('auto') },
  ]
  // Each label at its own size, as in 12-Appearance.png (FR-008).
  const sizes: { value: TextSize; label: string; labelClassName: string }[] = [
    { value: 'small', label: t('small'), labelClassName: 'text-base' },
    { value: 'default', label: t('default'), labelClassName: 'text-lg' },
    { value: 'large', label: t('large'), labelClassName: 'text-xl' },
  ]

  return (
    <div className="flex flex-col gap-8">
      <AppearancePreview name={me.displayName} />

      <Section title={t('mode')}>
        <SegmentedChoice
          label={t('mode')}
          value={look.colorMode}
          options={modes}
          onChange={(colorMode) => change({ colorMode })}
        />
      </Section>

      <Section title={t('colourTheme', { name: t(`themes.${look.themeId}`) })}>
        <ThemeSwatches value={look.themeId} onChange={(themeId) => change({ themeId })} />
      </Section>

      <Section title={t('font', { name: fontName(look.fontId) })}>
        <FontTiles
          label={t('font', { name: fontName(look.fontId) })}
          value={look.fontId}
          onChange={(fontId) => change({ fontId })}
        />
      </Section>

      <Section title={t('textSize')}>
        <SegmentedChoice
          label={t('textSize')}
          value={look.textSize}
          options={sizes}
          onChange={(textSize) => change({ textSize })}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}
