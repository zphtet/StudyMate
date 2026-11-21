'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { freeGaps } from '@/lib/availability'
import { utcToZoned } from '@/lib/time'
import { cn } from '@/lib/utils'

// One local day's availability, 00–24 (screen 22-AdminPlan; spec 003 US4, FR-009; 005 reuses it).
// Positions are scaled to the day's real length, so a daylight-saving day of 23 or 25 hours still
// fills the bar. Shift and Sleep come from the server (busy_segments); free time is the gaps. The
// bar is an image with a text summary ("Sleep 00:00–08:00, Free 08:00–22:00, Shift 22:00–24:00").

export type DayBarSegment = { kind: 'shift' | 'sleep'; start: string; end: string }
type Kind = DayBarSegment['kind'] | 'free'

const FILL: Record<Kind, string> = {
  shift: 'bg-avail-shift',
  sleep: 'bg-avail-sleep',
  free: 'bg-avail-free',
}

export function DayBar({
  start,
  end,
  segments,
  timeZone,
  now,
  className,
}: {
  /** The local day's real bounds (ISO). */
  start: string
  end: string
  /** Shift / Sleep, clipped to the day. */
  segments: DayBarSegment[]
  /** The zone the day belongs to (the student's). */
  timeZone: string
  /** Shows the now-marker when inside the day. */
  now?: Date
  className?: string
}) {
  const t = useTranslations('dayBar')
  const format = useFormatter()
  const from = Date.parse(start)
  const length = Date.parse(end) - from
  const free = freeGaps(
    segments.map((s) => ({ kind: s.kind, start: new Date(s.start), end: new Date(s.end) })),
    new Date(start),
    new Date(end),
  ).map((g) => ({ kind: 'free' as const, start: g.start.toISOString(), end: g.end.toISOString() }))
  const pieces: { kind: Kind; start: string; end: string }[] = [...segments, ...free].sort((a, b) =>
    a.start.localeCompare(b.start),
  )
  const clock = (at: string) => (at === end ? '24:00' : utcToZoned(at, timeZone).time)
  const percent = (at: number) => `${((at - from) / length) * 100}%`
  const isNowInside = now !== undefined && now.getTime() >= from && now.getTime() < from + length

  const parts = pieces.map((p) =>
    t('part', { kind: t(p.kind), from: clock(p.start), to: clock(p.end) }),
  )
  if (isNowInside) parts.push(t('now', { time: utcToZoned(now, timeZone).time }))

  return (
    <div
      role="img"
      aria-label={format.list(parts, { type: 'unit' })}
      data-testid="day-bar"
      className={cn('relative h-3 overflow-hidden rounded-full bg-muted', className)}
    >
      {pieces.map((p) => (
        <span
          key={p.start}
          data-kind={p.kind}
          className={cn('absolute inset-y-0 border-x border-card', FILL[p.kind])}
          style={{
            left: percent(Date.parse(p.start)),
            width: percent(from + Date.parse(p.end) - Date.parse(p.start)),
          }}
        />
      ))}
      {isNowInside && (
        <span
          data-testid="now-marker"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-destructive"
          style={{ left: percent(now.getTime()) }}
        />
      )}
    </div>
  )
}

/** "00 06 12 18 24" above a column of day bars. */
export function DayBarScale({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('flex justify-between text-xs text-muted-foreground tabular-nums', className)}
    >
      {['00', '06', '12', '18', '24'].map((hour) => (
        <span key={hour}>{hour}</span>
      ))}
    </div>
  )
}

/** Shift / Sleep / Free swatches. */
export function DayBarLegend({ className }: { className?: string }) {
  const t = useTranslations('dayBar')
  return (
    <ul aria-label={t('legend')} className={cn('flex gap-3 text-sm', className)}>
      {(['shift', 'sleep', 'free'] as const).map((kind) => (
        <li key={kind} className="flex items-center gap-1">
          <span aria-hidden className={cn('size-2.5 rounded-sm', FILL[kind])} />
          {t(kind)}
        </li>
      ))}
    </ul>
  )
}
