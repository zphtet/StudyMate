'use client'

import { Pencil } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { SyncPill } from '@/components/shared/sync-pill'
import { DayBar, DayBarScale } from '@/components/shared/day-bar'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dayBar, dayTimeline, type TimelineEntry } from '../timeline'
import type { Segment, ShiftView } from '../types'
import { isLocalShift, shiftKey } from '../offline'
import { ShiftSwatch } from './shift-chip'
import { useDayLabel } from './use-day-label'

// The selected day under the calendar (screen 07-Shifts; spec 005 US3; contracts/ui-routes.md):
// "Today · Fri 20 Nov" and Edit, 003's 24 h bar, and the list of shifts, sleep and free windows
// (research R6). Computed from the month read, so choosing another day makes no request.

export function DayCard({
  date,
  today,
  timeZone,
  shifts,
  segments,
  afterShiftBuffer,
}: {
  date: string
  today: string
  timeZone: string
  shifts: ShiftView[]
  segments: Segment[]
  afterShiftBuffer: number
}) {
  const t = useTranslations('shifts')
  const format = useFormatter()
  const dayLabel = useDayLabel()
  const range = useRange(timeZone)
  const dayName = dayLabel(date)
  const heading = date === today ? t('today', { date: dayName }) : dayName
  const bar = dayBar({ segments, timeZone, date })
  const entries = dayTimeline({ shifts, segments, timeZone, date, afterShiftBuffer })
  const startingToday = entries.find(
    (e): e is Extract<TimelineEntry, { kind: 'shift' }> => e.kind === 'shift' && !e.startsBefore,
  )
  const hasShift = entries.some((e) => e.kind === 'shift')
  const freeRanges = entries.filter((e) => e.kind === 'free').map(range)

  return (
    <section
      aria-labelledby="shift-day"
      className="flex flex-col gap-3 rounded-3xl border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="shift-day" className="text-lg font-semibold">
          {heading}
        </h2>
        <Button asChild variant="ghost" size="touch" className="text-primary">
          <Link
            href={
              startingToday && !isLocalShift(startingToday.shift.id)
                ? `/s/shifts/${startingToday.shift.id}`
                : `/s/shifts/new?date=${date}`
            }
            aria-label={t('editLabel', { date: dayName })}
          >
            <Pencil aria-hidden />
            {t('edit')}
          </Link>
        </Button>
      </div>
      <div>
        <DayBar
          start={bar.start}
          end={bar.end}
          segments={bar.segments}
          timeZone={timeZone}
          className="h-9 rounded-lg"
        />
        <DayBarScale className="mt-1" />
      </div>
      {hasShift ? (
        <ul aria-label={t('dayShifts', { date: dayName })} className="flex flex-col">
          {entries.map((entry) => (
            <li key={`${entry.kind}:${entry.start}`}>
              <EntryRow entry={entry} range={range(entry)} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          {freeRanges.length > 0
            ? t('noShiftFree', { ranges: format.list(freeRanges, { type: 'conjunction' }) })
            : t('noShift')}
        </p>
      )}
    </section>
  )
}

/** "00:00–07:00" (from an earlier day), "22:00 → Sat 07:00" (to a later day), "15:30–23:00". */
function useRange(timeZone: string) {
  const t = useTranslations('shifts')
  const { time, weekday } = useInstantFormat()
  return (entry: TimelineEntry) => {
    if (entry.kind === 'shift' && entry.shift.type === 'off') return t('wholeDay')
    const start = entry.startsBefore ? '00:00' : time(entry.start, timeZone)
    if (entry.endsAfter) {
      return t('overnightRange', {
        start,
        end: time(entry.end, timeZone),
        weekday: weekday(entry.end, timeZone),
      })
    }
    return `${start}–${time(entry.end, timeZone)}`
  }
}

function EntryRow({
  entry,
  range,
  timeZone,
}: {
  entry: TimelineEntry
  range: string
  timeZone: string
}) {
  const t = useTranslations('shifts')
  const format = useFormatter()
  const { weekday } = useInstantFormat()
  const row = 'flex min-h-11 items-center gap-3 rounded-xl py-2'
  const rangeText = <span className="w-28 shrink-0 tabular-nums">{range}</span>

  if (entry.kind === 'shift') {
    const type = t(`named.${entry.shift.type}`)
    const content = (
      <>
        <ShiftSwatch type={entry.shift.type} className="size-3 w-3 shrink-0 rounded-sm" />
        {rangeText}
        <span className="min-w-0 flex-1">
          {entry.startsBefore
            ? t('fromYesterday', { type, weekday: weekday(entry.start, timeZone) })
            : type}
        </span>
        <SyncPill recordKey={shiftKey(entry.shift.id)} className="shrink-0" />
      </>
    )
    // Added offline (spec 008): it has no page until it syncs and gets its real id.
    return isLocalShift(entry.shift.id) ? (
      <div className={row}>{content}</div>
    ) : (
      <Link href={`/s/shifts/${entry.shift.id}`} className={cn(row, 'hover:bg-muted/50')}>
        {content}
      </Link>
    )
  }
  return (
    <div className={row}>
      <span
        aria-hidden
        className={cn(
          'size-3 shrink-0 rounded-sm',
          entry.kind === 'sleep' ? 'bg-avail-sleep' : 'bg-avail-free',
        )}
      />
      {rangeText}
      <span className={cn('min-w-0 flex-1', entry.kind === 'free' && 'font-medium text-success')}>
        {entry.kind === 'sleep'
          ? t('sleepAuto', {
              hours: format.number(entry.minutes / 60, { maximumFractionDigits: 1 }),
            })
          : t('freeToStudy')}
      </span>
    </div>
  )
}
