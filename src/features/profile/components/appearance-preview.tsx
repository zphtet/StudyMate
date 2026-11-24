'use client'

import { useTranslations } from 'next-intl'
import { useDayPeriod } from '@/components/shared/use-day-period'

/**
 * The preview card (spec 007 FR-011, research R11; 12-Appearance.png): a sample Today card that
 * follows every change because it renders under the same <html> theme, font and size. Sample
 * content, not the viewer's data, and not interactive: one image to assistive tech, its "buttons"
 * drawn as spans (real buttons inside role="img" break axe's nested-interactive rule).
 */
export function AppearancePreview({ name }: { name: string }) {
  const t = useTranslations()
  const period = useDayPeriod()
  return (
    <div
      role="img"
      aria-label={t('appearance.preview')}
      className="flex flex-col gap-4 rounded-3xl border bg-card p-5 text-card-foreground"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-xl font-bold">{t('today.greeting', { period, name })}</span>
        <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
          {t('appearance.previewStreak', { n: 6 })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-lg font-bold">{t('appearance.previewLesson')}</span>
        <span className="text-[0.9375rem] text-muted-foreground">
          {t('appearance.previewMeta')}
        </span>
      </div>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span className="block h-full w-3/5 rounded-full bg-primary" />
      </span>
      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <span className="flex min-h-11 items-center justify-center rounded-xl border bg-card px-3 py-1.5 text-center leading-tight font-semibold">
          {t('lessonWork.focus.start', { minutes: 15 })}
        </span>
        <span className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-1.5 text-center leading-tight font-semibold text-primary-foreground">
          {t('lessonWork.markComplete')}
        </span>
      </div>
    </div>
  )
}
