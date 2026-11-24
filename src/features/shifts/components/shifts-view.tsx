'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat, Settings2 } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { SettingsGroup, SettingsRow } from '@/components/shared/settings'
import { Button } from '@/components/ui/button'
import { addMonths } from '@/lib/time'
import { monthShiftsQuery, shiftSettingsQuery } from '../queries'
import { useKeepShiftPages } from '../use-keep-shift-pages'
import { lettersOf } from '../rotation'
import type { ShiftType } from '../types'
import { DayCard } from './day-card'
import { ShiftCalendar } from './shift-calendar'
import { ShiftSwatch } from './shift-chip'
import { ShiftSettingsSheet } from './shift-settings-sheet'
import { WeekCheckCard } from './week-check-card'

// The Shifts tab (screen 07-Shifts; spec 005 US1; contracts/ui-routes.md): Add shift, the month with
// its shift chips, the selected day's bar and list (US3) and the settings row. One request per month:
// choosing a day only changes `?day=` in the address bar (research R6).

const LEGEND_ORDER: ShiftType[] = ['day', 'evening', 'night', 'custom']

export function ShiftsView({ month }: { month: string }) {
  const t = useTranslations('shifts')
  const format = useFormatter()
  const { data } = useSuspenseQuery(monthShiftsQuery(month))
  const { rotation, settings } = useSuspenseQuery(shiftSettingsQuery).data
  useKeepShiftPages(data.shifts)
  const tRotation = useTranslations('rotation')
  const searchParams = useSearchParams()
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  const requested = searchParams.get('day')
  const selected =
    requested?.startsWith(month) && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : data.today.startsWith(month)
        ? data.today
        : `${month}-01`
  // Native history: Next keeps useSearchParams in sync without a server round trip.
  const selectDay = (date: string) =>
    window.history.replaceState(null, '', `/s/shifts?month=${month}&day=${date}`)

  const types = new Set(data.shifts.map((s) => s.type))
  const legend = LEGEND_ORDER.filter((type) => types.has(type))
  const monthName = format.dateTime(new Date(`${month}-01T00:00:00Z`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="flex flex-col gap-5 pb-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button asChild size="touch">
            <Link href={`/s/shifts/new?date=${selected}`}>
              <Plus aria-hidden />
              {t('addShift')}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={`/s/shifts?month=${addMonths(month, -1)}`} aria-label={t('previousMonth')}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <h2 className="min-w-36 text-center text-xl font-semibold">{monthName}</h2>
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={`/s/shifts?month=${addMonths(month, 1)}`} aria-label={t('nextMonth')}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
        {legend.length > 0 && (
          <ul aria-label={t('legend')} className="flex gap-3 text-sm text-muted-foreground">
            {legend.map((type) => (
              <li key={type} className="flex items-center gap-1.5">
                <ShiftSwatch type={type} className="size-3 w-3 rounded-sm" />
                {t(`types.${type}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <WeekCheckCard />
      <section aria-label={monthName} className="rounded-3xl border bg-card p-2">
        <ShiftCalendar
          month={month}
          today={data.today}
          timeZone={data.timeZone}
          shifts={data.shifts}
          selected={selected}
          onSelectDay={selectDay}
        />
      </section>
      {!data.hasShifts && (
        <EmptyState icon={CalendarDays}>
          {t('empty')}{' '}
          <Link
            href="/s/shifts/rotation"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {tRotation('setUp')}
          </Link>
        </EmptyState>
      )}
      <DayCard
        date={selected}
        today={data.today}
        timeZone={data.timeZone}
        shifts={data.shifts}
        segments={data.segments}
        afterShiftBuffer={settings.afterShiftBuffer}
      />
      <SettingsGroup>
        <SettingsRow
          href="/s/shifts/rotation"
          icon={<Repeat className="size-5 text-muted-foreground" aria-hidden />}
          label={tRotation('row')}
          value={
            rotation
              ? tRotation('rowValue', {
                  sequence: lettersOf(rotation.sequence)
                    .map((l) => tRotation(`letters.${l}`))
                    .join(''),
                  date: format.dateTime(new Date(`${rotation.startDate}T00:00:00Z`), {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }),
                })
              : tRotation('setUp')
          }
        />
        <SettingsRow
          onClick={() => setSettingsOpen(true)}
          icon={<Settings2 className="size-5 text-muted-foreground" aria-hidden />}
          label={t('settings')}
        />
      </SettingsGroup>
      <ShiftSettingsSheet open={isSettingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
