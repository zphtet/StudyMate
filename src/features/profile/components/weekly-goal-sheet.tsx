'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Target } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { SettingsRow } from '@/components/shared/settings'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { progressKeys } from '@/features/progress/queries'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { setWeeklyGoal } from '../actions'
import { meQuery } from '../queries'
import type { MeResponse } from '../types'

// "Weekly goal · {n} days" on Me (screen 11-Profile; spec 004 FR-008, research.md R4): a row that
// opens a bottom sheet with 7 buttons. Choosing one saves it and closes the sheet; Today and Progress
// refetch their "{n} of {goal}" labels.

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function WeeklyGoalSheet({ days }: { days: number }) {
  const t = useTranslations('weeklyGoal')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const [open, setOpen] = useState(false)
  // Choosing a goal saves it at once, which needs the server (spec 008 R14).
  const connection = useNeedsConnection()

  const save = useMutation({
    mutationFn: async (next: number) => unwrap(await setWeeklyGoal({ days: next })),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: meQuery.queryKey })
      const snapshot = queryClient.getQueryData<MeResponse>(meQuery.queryKey)
      queryClient.setQueryData<MeResponse>(
        meQuery.queryKey,
        (old) => old && { ...old, weeklyGoalDays: next },
      )
      setOpen(false)
      return { snapshot }
    },
    onError: (error, _next, context) => {
      if (context?.snapshot) queryClient.setQueryData(meQuery.queryKey, context.snapshot)
      toast.error(errorMessage(error))
    },
    onSettled: () =>
      Promise.all(
        [meQuery.queryKey, progressKeys.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })

  return (
    <>
      <SettingsRow
        onClick={() => setOpen(true)}
        icon={<Target className="size-5 text-primary" aria-hidden />}
        label={t('row')}
        value={t('days', { count: days })}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent>
          <SheetHeader>
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>{t('description')}</SheetDescription>
          </SheetHeader>
          <div
            role="radiogroup"
            aria-label={t('title')}
            className="grid grid-cols-7 gap-2 px-4 pb-8"
          >
            {DAYS.map((n) => (
              <Button
                key={n}
                role="radio"
                aria-checked={n === days}
                variant={n === days ? 'default' : 'outline'}
                size="touch"
                className={cn('px-0 text-base tabular-nums', n === days && 'font-semibold')}
                disabled={connection.disabled}
                aria-describedby={connection.describedBy}
                onClick={() => save.mutate(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </BottomSheetContent>
      </Sheet>
    </>
  )
}
