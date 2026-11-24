'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { ColorMode } from '@/lib/appearance'
import { meQuery } from '../queries'
import { AppearancePreview } from './appearance-preview'
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
