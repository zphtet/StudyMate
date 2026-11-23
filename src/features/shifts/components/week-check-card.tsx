'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { confirmShiftWeek } from '../actions'
import { shiftKeys, shiftsTodayQuery } from '../queries'
import type { ShiftsToday } from '../types'
import { weekCheck } from '@/lib/week-check'
import { useDayLabel } from './use-day-label'
import { useMinuteClock } from './use-minute-clock'

// The Sunday check (spec 005 FR-009; research R9; US2 scenario 3) on Today and Shifts: "Next week's
// shifts — correct?" from Sunday 18:00 in the student's time until they answer or the week starts.
// Confirm and Edit both dismiss it for that week on every device (stored on the profile); Edit then
// opens next Monday. Judged with the device's clock, so it appears at 18:00 without a request.

export function WeekCheckCard() {
  const t = useTranslations('weekCheck')
  const errorMessage = useErrorMessage()
  const dayLabel = useDayLabel()
  const router = useRouter()
  const queryClient = useQueryClient()
  const now = useMinuteClock()
  const { data } = useQuery(shiftsTodayQuery)

  const confirm = useMutation({
    mutationFn: async () => unwrap(await confirmShiftWeek({})),
    onMutate: async (week: string) => {
      await queryClient.cancelQueries({ queryKey: shiftKeys.today })
      const before = queryClient.getQueryData<ShiftsToday>(shiftKeys.today)
      queryClient.setQueryData<ShiftsToday>(
        shiftKeys.today,
        (d) => d && { ...d, confirmedWeek: week, weekCheck: { ...d.weekCheck, due: false } },
      )
      return { before }
    },
    onError: (e, _week, context) => {
      queryClient.setQueryData(shiftKeys.today, context?.before)
      toast.error(errorMessage(e))
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: shiftKeys.today }),
        // 006 FR-010: answering also answers the check's notification (the bell's count).
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]),
  })

  if (!data || !now) return null
  const check = weekCheck({
    now,
    timeZone: data.timeZone,
    confirmedWeek: data.confirmedWeek,
    hasShifts: data.hasShifts,
  })
  if (!check.due) return null

  return (
    <section
      aria-labelledby="week-check"
      className="flex flex-col gap-3 rounded-3xl border border-primary/30 bg-accent p-4"
    >
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 id="week-check" className="font-semibold text-accent-foreground">
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('body', { date: dayLabel(check.week) })}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="touch" onClick={() => confirm.mutate(check.week)}>
          {t('confirm')}
        </Button>
        <Button
          size="touch"
          onClick={() => {
            confirm.mutate(check.week)
            router.push(`/s/shifts?month=${check.week.slice(0, 7)}&day=${check.week}`)
          }}
        >
          {t('edit')}
        </Button>
      </div>
    </section>
  )
}
