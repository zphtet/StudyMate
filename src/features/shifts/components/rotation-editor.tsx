'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { inputClass } from '@/components/shared/field'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayKeys } from '@/features/assignments/queries'
import { unwrap } from '@/lib/result'
import { addCalendarDays, mondayOf } from '@/lib/time'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { deleteRotation, saveRotation } from '../actions'
import { shiftKeys, shiftSettingsQuery } from '../queries'
import { lettersOf, rotationDays } from '../rotation'
import { ROTATION_LETTERS, saveRotationSchema, type RotationLetter } from '../schemas'
import type { ShiftType } from '../types'
import { SHIFT_COLOR } from './shift-chip'
import { useDayLabel } from './use-day-label'

// My rotation (spec 005 US2; research R4; contracts/ui-routes.md): the pattern as letter tiles (tap
// one to remove it, + Day / Evening / Night / Off to append, up to 28), the start date, a 14-day
// preview from the student's preset times, Save (the days kept for the student's own shifts are
// listed once) and Delete. Saving replaces the active rotation (FR-010) under FR-007's rules.

const MAX_DAYS = 28
const TYPE_OF: Record<RotationLetter, ShiftType> = { D: 'day', E: 'evening', N: 'night', O: 'off' }

export function RotationEditor({
  timeZone,
  today,
  start,
  letter,
}: {
  timeZone: string
  today: string
  /** From the shift editor: this day starts a new pattern whose first letter is `letter`. */
  start?: string
  letter?: RotationLetter
}) {
  const t = useTranslations('rotation')
  const tTypes = useTranslations('shifts.types')
  const tNamed = useTranslations('shifts.named')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const { time } = useInstantFormat()
  const dayLabel = useDayLabel()
  const router = useRouter()
  const queryClient = useQueryClient()
  const uid = useId()
  const { settings, rotation } = useSuspenseQuery(shiftSettingsQuery).data

  const [sequence, setSequence] = useState(() =>
    start ? (letter ?? '') : (rotation?.sequence ?? letter ?? ''),
  )
  const [startDate, setStartDate] = useState(
    () => start ?? rotation?.startDate ?? addCalendarDays(mondayOf(today), 7),
  )
  const [error, setError] = useState<string | null>(null)

  const firstDay = startDate > today ? startDate : today
  const preview =
    sequence.length > 0
      ? rotationDays(
          { sequence, startDate },
          settings.presets,
          timeZone,
          firstDay,
          addCalendarDays(firstDay, 13),
        )
      : []

  const finish = async (message: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: shiftKeys.all }),
      queryClient.invalidateQueries({ queryKey: todayKeys.all }),
    ])
    toast.success(message)
  }
  const save = useMutation({
    mutationFn: async () => unwrap(await saveRotation({ sequence, startDate })),
    onSuccess: async ({ skippedDays }) => {
      await finish(t('saved'))
      if (skippedDays.length > 0) toast(t('kept', { count: skippedDays.length }))
      router.push(`/s/shifts?month=${firstDay.slice(0, 7)}&day=${firstDay}`)
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: async () => unwrap(await deleteRotation({})),
    onSuccess: async () => {
      await finish(t('deleted'))
      router.push('/s/shifts')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  // Saving and deleting the rotation need the server (spec 008 R14).
  const connection = useNeedsConnection()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (connection.disabled) return
    const parsed = saveRotationSchema.safeParse({ sequence, startDate })
    if (!parsed.success) return setError(validation(parsed.error.issues[0]?.message) ?? null)
    setError(null)
    save.mutate()
  }
  const busy = save.isPending || remove.isPending
  const formId = `${uid}-form`

  return (
    <>
      <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-2 bg-background/95 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Button asChild variant="ghost" size="touch" className="text-primary">
          <Link href="/s/shifts">{t('cancel')}</Link>
        </Button>
        <h1 className="truncate text-lg font-semibold">{t('title')}</h1>
        <span className="w-16" aria-hidden />
      </header>

      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-6 pt-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold text-muted-foreground">{t('pattern')}</legend>
          <p className="text-sm text-muted-foreground">{t('patternHint')}</p>
          {sequence.length > 0 && (
            <ol className="flex flex-wrap gap-1.5">
              {lettersOf(sequence).map((l, i) => {
                const type = TYPE_OF[l]
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setSequence((s) => s.slice(0, i) + s.slice(i + 1))}
                      aria-label={t('tile', { number: i + 1, type: tTypes(type) })}
                      className={cn(
                        'flex size-11 items-center justify-center rounded-xl text-base font-semibold',
                        SHIFT_COLOR[type],
                      )}
                    >
                      {t(`letters.${l}`)}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="grid grid-cols-4 gap-2">
            {ROTATION_LETTERS.map((l) => (
              <Button
                key={l}
                type="button"
                variant="outline"
                size="touch"
                disabled={sequence.length >= MAX_DAYS}
                onClick={() => setSequence((s) => s + l)}
                className="px-1"
              >
                {t('add', { type: tTypes(TYPE_OF[l]) })}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-start`} className="font-semibold text-muted-foreground">
            {t('startsOn')}
          </Label>
          <Input
            id={`${uid}-start`}
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <section aria-labelledby={`${uid}-preview`} className="rounded-3xl border bg-card p-4">
          <h2 id={`${uid}-preview`} className="mb-2 font-semibold">
            {t('preview')}
          </h2>
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('previewEmpty')}</p>
          ) : (
            <ul className="flex flex-col">
              {preview.map((d) => (
                <li key={d.date} className="flex min-h-9 items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{dayLabel(d.date)}</span>
                  <span
                    aria-hidden
                    className={cn('size-3 shrink-0 rounded-sm', SHIFT_COLOR[TYPE_OF[d.letter]])}
                  />
                  <span>{tNamed(TYPE_OF[d.letter])}</span>
                  {d.shift && (
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {time(d.shift.start, timeZone)}–{time(d.shift.end, timeZone)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        {rotation && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="xl"
                disabled={connection.disabled || busy}
                aria-describedby={connection.describedBy}
              >
                <Trash2 aria-hidden />
                {t('delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('deleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={connection.disabled}
                  aria-describedby={connection.describedBy}
                  onClick={() => remove.mutate()}
                >
                  {t('delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </form>

      <BottomBar>
        <Button
          type="submit"
          form={formId}
          size="xl"
          className="flex-1"
          disabled={connection.disabled || busy}
          aria-describedby={connection.describedBy}
        >
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {t('save')}
        </Button>
      </BottomBar>
    </>
  )
}
