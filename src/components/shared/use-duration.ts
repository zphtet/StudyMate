'use client'

import { useTranslations } from 'next-intl'

// Study time as people read it (spec 004 contracts: durations are whole seconds, the client formats
// "7 h 40 m"): "45 min" under an hour, "7 h 40 m" from an hour, in the viewer's language.
export function useDuration() {
  const t = useTranslations('common.duration')
  return (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    return minutes < 60
      ? t('minutes', { minutes })
      : t('hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
  }
}
