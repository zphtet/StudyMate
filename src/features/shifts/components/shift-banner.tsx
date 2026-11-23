'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { utcToZoned } from '@/lib/time'
import { cn } from '@/lib/utils'
import { shiftKeys, shiftsTodayQuery } from '../queries'
import type { ShiftsToday } from '../types'
import { SHIFT_COLOR } from './shift-chip'
import { useMinuteClock } from './use-minute-clock'

// Today's shift banner (screen 04-Today; spec 005 US3; research R7): "Night shift tonight ·
// 22:00–07:00", "Day shift today · 09:00–18:00" or "On shift until 07:00", then "Good window to
// study now: about 90 min free" or "Free again at 15:30". Nothing without a working shift today.
// Times are the student's; the free minutes count down on the device's clock.

/** 32-bit setTimeout limit; the banner's times are within 2 days anyway. */
const MAX_DELAY_MS = 2_147_483_647

export function ShiftBanner() {
  const t = useTranslations('shiftBanner')
  const tShifts = useTranslations('shifts')
  const { time, weekdayTime } = useInstantFormat()
  const now = useMinuteClock()
  const { data } = useQuery(shiftsTodayQuery)
  useRefetchAtNextChange(data)
  if (!data?.shift) return null

  const { shift, free, timeZone } = data
  // Before mount, the server's "now": both renders agree.
  const clock = now ?? new Date(data.now)
  const range = { start: time(shift.startAt, timeZone), end: time(shift.endAt, timeZone) }
  const title = shift.running
    ? t('onShiftUntil', { time: range.end })
    : shift.type === 'night'
      ? t('nightTonight', range)
      : t('shiftToday', { type: tShifts(`named.${shift.type}`), ...range })

  let detail: string | null = null
  if (free.now) {
    const minutes = Math.max(0, Math.round((Date.parse(free.until) - clock.getTime()) / 60_000))
    detail =
      minutes >= 120
        ? t('freeNowHours', { hours: Math.floor(minutes / 60) })
        : t('freeNow', { minutes })
  } else if (free.nextAt) {
    const isToday = utcToZoned(free.nextAt, timeZone).date === utcToZoned(clock, timeZone).date
    detail = t('freeAt', {
      time: isToday ? time(free.nextAt, timeZone) : weekdayTime(free.nextAt, timeZone),
    })
  }
  const Icon = shift.type === 'night' ? Moon : Sun

  return (
    <section
      aria-label={t('label')}
      className={cn('flex items-center gap-4 rounded-3xl px-5 py-4', SHIFT_COLOR[shift.type])}
    >
      <Icon className="size-7 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="leading-snug font-semibold">{title}</p>
        {detail && <p className="text-[0.95rem] leading-snug opacity-90">{detail}</p>}
      </div>
    </section>
  )
}

/** Refetch a second after the earliest time the banner shows passes (a shift starts or ends, …). */
function useRefetchAtNextChange(data: ShiftsToday | undefined) {
  const queryClient = useQueryClient()
  const free = data?.free
  const next = [
    data?.shift && (data.shift.running ? data.shift.endAt : data.shift.startAt),
    free && (free.now ? free.until : free.nextAt),
  ]
    .filter((at): at is string => typeof at === 'string')
    .sort()[0]
  useEffect(() => {
    if (!next) return
    const delay = Math.min(Math.max(Date.parse(next) - Date.now(), 0) + 1000, MAX_DELAY_MS)
    const timer = setTimeout(
      () => queryClient.invalidateQueries({ queryKey: shiftKeys.today }),
      delay,
    )
    return () => clearTimeout(timer)
  }, [next, queryClient])
}
