'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { ruleSummary, type DaysLabel } from '@/lib/notifications/rule-summary'
import type { RuleView } from '@/lib/notifications/rule-config'

// A rule row's badge, title and summary in the viewer's language (spec 006 contracts/ui-routes.md ›
// Alerts and Me; "20:00 · Mon–Fri", "Nudge May · alert me"). Alerts and My reminders both use it.
// The student is named, never "she/he" (FR-012).

export function useRuleText() {
  const t = useTranslations('ruleSummary')
  const format = useFormatter()
  const weekday = (day: number) => t('weekday', { day })

  const daysText = (days: DaysLabel) => {
    if (days.kind === 'every') return t('everyDay')
    if (days.kind === 'range') return t('range', { from: weekday(days.from), to: weekday(days.to) })
    return format.list(days.days.map(weekday), { type: 'unit', style: 'short' })
  }

  /** `studentName`: the student the rule applies to, or null for All students. */
  return (rule: Pick<RuleView, 'config'>, studentName: string | null) => {
    const { badge, title, summary: s } = ruleSummary(rule, studentName)
    const summary = (() => {
      switch (s.key) {
        case 'daily':
          return t('daily', { time: s.time, days: daysText(s.days) })
        case 'after_shift':
          return t('afterShift', { hours: s.hours })
        case 'due_soon':
          return t('dueSoon', { hours: format.list(s.hours.map((hours) => t('hours', { hours }))) })
        case 'overdue':
          return t('overdue', { time: s.time, max: s.max })
        case 'streak_risk':
          return t('streakRisk', { time: s.time })
        case 'inactive':
          return s.name ? t('inactive', { to: s.to, name: s.name }) : t('inactiveAll', { to: s.to })
        case 'weekly_summary': {
          const values = { weekday: t('weekdayLong', { day: s.weekday }), time: s.time, to: s.to }
          return s.name ? t('weekly', { ...values, name: s.name }) : t('weeklyAll', values)
        }
      }
    })()
    return {
      badge,
      badgeLabel: t(`badge.${badge}`),
      title: t(`title.${title.key}`, { days: title.days ?? 0 }),
      summary,
    }
  }
}
