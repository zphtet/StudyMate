'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { House } from 'lucide-react'
import { useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useId, useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { TodayLabel } from '@/components/shared/today-label'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { cityOf, utcToZoned } from '@/lib/time'
import { cn } from '@/lib/utils'
import { todayQuery } from '../queries'
import type { TodayItem } from '../types'
import { DueChip } from './due-chip'

// Student Today (screen 04-Today, partial per contracts/ui-routes.md): date line, greeting, then
// "Overdue · N" (oldest first) and "Due today" (earliest first), 5 rows each, then "Show all (N)".
// The bell (006), shift banner (005), streak, weekly goal and Continue cards (004) come later.

const PAGE = 5

/** morning < 12:00 ≤ afternoon < 18:00 ≤ evening, on the viewer's clock. */
function useDayPeriod() {
  const f = useInstantFormat()
  const now = useNow({ updateInterval: 60_000 })
  const hour = Number(utcToZoned(now, f.viewerZone).time.slice(0, 2))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

export function TodayView({ name }: { name: string }) {
  const t = useTranslations('today')
  const f = useInstantFormat()
  const period = useDayPeriod()
  const { data } = useSuspenseQuery(todayQuery)

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader
        eyebrow={t.rich('dateLine', { date: () => <TodayLabel />, city: cityOf(f.viewerZone) })}
        title={t('greeting', { period, name })}
      />
      {data.overdue.length === 0 && data.dueToday.length === 0 ? (
        <EmptyState icon={House} title={t('empty')}>
          {t('emptyBody')}
        </EmptyState>
      ) : (
        <>
          {data.overdue.length > 0 && (
            <TodaySection
              title={t('overdue', { count: data.overdue.length })}
              items={data.overdue}
              tone="overdue"
            />
          )}
          {data.dueToday.length > 0 && (
            <TodaySection title={t('dueToday')} items={data.dueToday} tone="today" />
          )}
        </>
      )}
    </div>
  )
}

function TodaySection({
  title,
  items,
  tone,
}: {
  title: string
  items: TodayItem[]
  tone: 'overdue' | 'today'
}) {
  const t = useTranslations('today')
  const headingId = useId()
  const [isExpanded, setExpanded] = useState(false)
  const shown = isExpanded ? items : items.slice(0, PAGE)

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className={cn(
          'text-lg font-semibold',
          tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.lessonId}>
            <TodayRow item={item} tone={tone} />
          </li>
        ))}
      </ul>
      {items.length > PAGE && !isExpanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-11 self-start rounded-full px-4 font-medium text-primary hover:bg-muted"
        >
          {t('showAll', { count: items.length })}
        </button>
      )}
    </section>
  )
}

function TodayRow({ item, tone }: { item: TodayItem; tone: 'overdue' | 'today' }) {
  const t = useTranslations('today')
  return (
    <Link
      href={`/s/lessons/${item.lessonId}`}
      className={cn(
        'flex min-h-18 items-center gap-3 rounded-3xl border bg-card px-4 py-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
        tone === 'overdue' && 'border-destructive/30',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          tone === 'overdue' ? 'bg-destructive' : 'bg-warning-foreground',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-semibold">{item.title}</span>
        <span className="mt-0.5 block text-[0.95rem] text-muted-foreground">
          {t.rich('lessonMeta', {
            course: item.courseTitle,
            minutes: item.estMinutes,
            m: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
          })}
        </span>
      </span>
      <DueChip due={item.due} variant="today" />
    </Link>
  )
}
