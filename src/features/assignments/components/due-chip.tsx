'use client'

import { useNow, useTranslations } from 'next-intl'
import { StatusChip } from '@/components/shared/status-chip'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { calendarDaysBetween } from '@/lib/time'
import type { Due } from '../types'

// Deadline chip (spec 003 FR-005 colours; contracts/ui-routes.md). Dates and times are the viewer's
// own (the student's on their screens):
//   default  Done · "N days late" / "Overdue" · "Due today" / "Due tomorrow" · "Due 24 Nov" · Locked
//   today    "N days late" / "Overdue" · "by 21:00" (Today rows: everything there is late or today)

const TONE = {
  done: 'success',
  overdue: 'danger',
  due_soon: 'warning',
  upcoming: 'muted',
  locked: 'muted',
} as const

export function DueChip({ due, variant = 'default' }: { due: Due; variant?: 'default' | 'today' }) {
  const t = useTranslations('deadlines')
  const f = useInstantFormat()
  const now = useNow({ updateInterval: 60_000 })
  if (due.status === 'none') return null

  const label = (() => {
    switch (due.status) {
      case 'done':
        return t('done')
      case 'overdue':
        return due.daysLate > 0 ? t('daysLate', { count: due.daysLate }) : t('overdue')
      case 'due_soon':
        if (variant === 'today') return t('byTime', { time: f.time(due.dueAt) })
        return calendarDaysBetween(now, new Date(due.dueAt), f.viewerZone) === 0
          ? t('dueToday')
          : t('dueTomorrow')
      case 'upcoming':
        return t('dueOn', { date: f.date(due.dueAt) })
      case 'locked':
        return t('locked')
    }
  })()
  return <StatusChip tone={TONE[due.status]}>{label}</StatusChip>
}
