'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { checkboxClass, inputClass } from '@/components/shared/field'
import { useInstantFormat } from '@/components/shared/use-instant-format'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayKeys } from '@/features/assignments/queries'
import { runOrQueue } from '@/lib/offline/run-or-queue'
import { ActionResultError, unwrap } from '@/lib/result'
import { addCalendarDays, shiftInstants, startOfLocalDay, utcToZoned } from '@/lib/time'
import { useErrorMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { deleteShift, saveShift } from '../actions'
import { shiftKeys, shiftQuery, shiftSettingsQuery } from '../queries'
import { queueShiftDelete, queueShiftSave } from '../offline'
import {
  clockTimeSchema,
  localDateSchema,
  type RotationLetter,
  type SaveShiftInput,
  type ShiftPresets,
} from '../schemas'
import type { ShiftSettings, ShiftType, ShiftView } from '../types'
import { ShiftTypePicker } from './shift-type-picker'
import { useDayLabel } from './use-day-label'

// The shift editor (screen 08-ShiftEdit; spec 005 US1 scenarios 1, 2, 4; contracts/ui-routes.md):
// the type tiles fill the times from the student's presets, Starts / Ends with "+1 day", a 48 h strip
// with the length, Repeat, Block sleep, and the errors from the server (overlap, > 24 h). Times are
// the student's own clock; the server turns them into instants (research R2).

type Form = { type: ShiftType; start: string; end: string; blockSleep: boolean }

const PRESET_OF: Partial<Record<ShiftType, keyof ShiftPresets>> = {
  day: 'D',
  evening: 'E',
  night: 'N',
}
/** "Repeat: My rotation": the rotation letter of each type; Custom has none (research R4). */
const LETTER_OF: Partial<Record<ShiftType, RotationLetter>> = {
  day: 'D',
  evening: 'E',
  night: 'N',
  off: 'O',
}
const DAY_MS = 86_400_000

/** A new shift on `date` (default Day; Add shift → Night → Save shift is SC-001's three taps). */
export function NewShiftEditor({ timeZone, date: serverDate }: { timeZone: string; date: string }) {
  const { settings } = useSuspenseQuery(shiftSettingsQuery).data
  // Read here too: offline, the page may come from a copy saved for another ?date= (spec 008 R2).
  const fromUrl = localDateSchema.safeParse(useSearchParams().get('date'))
  const date = fromUrl.success ? fromUrl.data : serverDate
  const [start, end] = settings.presets.D
  return (
    <ShiftForm
      timeZone={timeZone}
      date={date}
      settings={settings}
      initial={{ type: 'day', start, end, blockSleep: false }}
    />
  )
}

/** An existing shift, with Delete. */
export function ExistingShiftEditor({ timeZone, shiftId }: { timeZone: string; shiftId: string }) {
  const { settings } = useSuspenseQuery(shiftSettingsQuery).data
  const { shift } = useSuspenseQuery(shiftQuery(shiftId)).data
  const start = utcToZoned(shift.startAt, timeZone)
  const [presetStart, presetEnd] = settings.presets.D
  const isOff = shift.type === 'off'
  return (
    <ShiftForm
      timeZone={timeZone}
      date={start.date}
      settings={settings}
      shift={shift}
      initial={{
        type: shift.type,
        start: isOff ? presetStart : start.time,
        end: isOff ? presetEnd : utcToZoned(shift.endAt, timeZone).time,
        blockSleep: shift.sleepMinutes > 0,
      }}
    />
  )
}

function ShiftForm({
  timeZone,
  date,
  settings,
  shift,
  initial,
}: {
  timeZone: string
  date: string
  settings: ShiftSettings
  shift?: ShiftView
  initial: Form
}) {
  const t = useTranslations('shiftEditor')
  const tErrors = useTranslations('errors')
  const errorMessage = useErrorMessage()
  const { time, weekday, weekdayTime } = useInstantFormat()
  const dayLabel = useDayLabel()
  const router = useRouter()
  const queryClient = useQueryClient()
  const uid = useId()
  const [form, setForm] = useState<Form>(initial)
  const [error, setError] = useState<string | null>(null)
  const [repeat, setRepeat] = useState<'once' | 'rotation'>('once')

  const backHref = `/s/shifts?month=${date.slice(0, 7)}&day=${date}`
  const isOff = form.type === 'off'
  const hasTimes =
    clockTimeSchema.safeParse(form.start).success && clockTimeSchema.safeParse(form.end).success
  const preview =
    !isOff && hasTimes ? shiftInstants({ date, start: form.start, end: form.end }, timeZone) : null

  const chooseType = (type: ShiftType) => {
    const preset = PRESET_OF[type]
    setForm((f) => ({
      ...f,
      type,
      ...(preset && { start: settings.presets[preset][0], end: settings.presets[preset][1] }),
      // Block sleep is on by default for Night (US1 scenario 4).
      blockSleep: type === 'off' ? f.blockSleep : type === 'night',
    }))
    if (!LETTER_OF[type]) setRepeat('once')
    setError(null)
  }

  /** "Overlaps your shift Fri 22:00–07:00" in the student's time (spec Edge Cases). */
  const describeError = (e: unknown) => {
    const params = e instanceof ActionResultError ? e.params : undefined
    if (e instanceof ActionResultError && e.code === 'shift_overlap' && params) {
      const span = `${weekdayTime(String(params.start), timeZone)}–${time(String(params.end), timeZone)}`
      return tErrors('shift_overlap', { time: span })
    }
    return errorMessage(e)
  }

  const done = async (message: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: shiftKeys.all }),
      queryClient.invalidateQueries({ queryKey: todayKeys.all }),
    ])
    toast.success(message)
    router.push(backHref)
  }

  // Offline (spec 008 FR-003), the change is queued and shown at once; overlap is checked on the
  // shifts this device has, with the same message.
  const queuedDone = (message: string) => {
    toast.success(message)
    router.push(backHref)
  }
  const label = dayLabel(date)
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () => {
      const input: SaveShiftInput = {
        shiftId: shift?.id,
        date,
        type: form.type,
        ...(!isOff && { start: form.start, end: form.end }),
        blockSleep: form.blockSleep,
      }
      return runOrQueue({
        online: async () => unwrap(await saveShift(input)),
        queue: () =>
          queueShiftSave({
            queryClient,
            input,
            shift,
            timeZone,
            sleepMinutes: settings.sleepMinutes,
            label,
          }),
      })
    },
    onSuccess: ({ isQueued }) => (isQueued ? queuedDone(t('saved')) : done(t('saved'))),
    onError: (e) => setError(describeError(e)),
  })
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: (existing: ShiftView) =>
      runOrQueue({
        online: async () => unwrap(await deleteShift({ shiftId: existing.id })),
        queue: () => queueShiftDelete({ queryClient, shift: existing, label }),
      }),
    onSuccess: ({ isQueued }) => (isQueued ? queuedDone(t('deleted')) : done(t('deleted'))),
    onError: (e) => setError(describeError(e)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const letter = LETTER_OF[form.type]
    // "Repeat: My rotation" doesn't save this shift: the rotation generates the day (research R11).
    if (repeat === 'rotation' && letter) {
      return router.push(`/s/shifts/rotation?start=${date}&type=${letter}`)
    }
    if (!isOff && !hasTimes) return setError(tErrors('invalid_input'))
    save.mutate()
  }

  const formId = `${uid}-form`
  const busy = save.isPending || remove.isPending

  return (
    <>
      <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-2 bg-background/95 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Button asChild variant="ghost" size="touch" className="text-primary">
          <Link href={backHref}>{t('cancel')}</Link>
        </Button>
        <h1 className="truncate text-lg font-semibold">{t('title', { date: dayLabel(date) })}</h1>
        <Button
          type="submit"
          form={formId}
          variant="ghost"
          size="touch"
          className="font-semibold text-primary"
          disabled={busy}
        >
          {t('save')}
        </Button>
      </header>

      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-6 pt-4">
        <div className="flex flex-col gap-3">
          <p id={`${uid}-type`} className="font-semibold text-muted-foreground">
            {t('type')}
          </p>
          <ShiftTypePicker value={form.type} onChange={chooseType} labelId={`${uid}-type`} />
        </div>

        {!isOff && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TimeField
                id={`${uid}-start`}
                label={t('starts')}
                value={form.start}
                onChange={(start) => setForm((f) => ({ ...f, start }))}
                note={dayLabel(date)}
              />
              <TimeField
                id={`${uid}-end`}
                label={t('ends')}
                value={form.end}
                onChange={(end) => setForm((f) => ({ ...f, end }))}
                note={dayLabel(preview?.endsNextDay ? addCalendarDays(date, 1) : date)}
                badge={preview?.endsNextDay ? t('nextDay') : undefined}
              />
            </div>
            {preview && (
              <ShiftStrip date={date} timeZone={timeZone} start={preview.start} end={preview.end} />
            )}
            {preview && (
              <p className="text-muted-foreground">
                {preview.endsNextDay
                  ? t('crossesMidnight', { duration: hoursLabel(t, preview.minutes) })
                  : hoursLabel(t, preview.minutes)}
              </p>
            )}
          </>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold text-muted-foreground">{t('repeat')}</legend>
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="radio"
              name={`${uid}-repeat`}
              checked={repeat === 'once'}
              onChange={() => setRepeat('once')}
              className="size-6 shrink-0 accent-primary"
            />
            {t('justThisDay')}
          </label>
          <label
            className={cn(
              'flex min-h-11 items-start gap-3 border-t pt-3 text-base',
              !LETTER_OF[form.type] && 'text-muted-foreground',
            )}
          >
            <input
              type="radio"
              name={`${uid}-repeat`}
              checked={repeat === 'rotation'}
              disabled={!LETTER_OF[form.type]}
              onChange={() => setRepeat('rotation')}
              aria-describedby={`${uid}-rotation-hint`}
              className="mt-0.5 size-6 shrink-0 accent-primary"
            />
            <span className="flex flex-col">
              {t('myRotation')}
              <span id={`${uid}-rotation-hint`} className="text-sm text-muted-foreground">
                {LETTER_OF[form.type] ? t('myRotationHint') : t('myRotationCustom')}
              </span>
            </span>
          </label>
        </fieldset>

        {!isOff && (
          <div className="flex items-center gap-3 rounded-2xl bg-accent p-4">
            <div className="min-w-0 flex-1">
              <Label
                htmlFor={`${uid}-sleep`}
                className="text-base font-semibold text-accent-foreground"
              >
                {t('blockSleep')}
              </Label>
              {preview && (
                <p id={`${uid}-sleep-note`} className="text-sm text-primary">
                  {sleepNote({ t, end: preview.end, settings, timeZone, time, weekday })}
                </p>
              )}
            </div>
            <Checkbox
              id={`${uid}-sleep`}
              checked={form.blockSleep}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, blockSleep: checked === true }))
              }
              aria-describedby={preview ? `${uid}-sleep-note` : undefined}
              className={checkboxClass}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        {shift && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="xl" disabled={busy}>
                <Trash2 aria-hidden />
                {t('delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {shift.fromRotation ? t('deleteGenerated') : t('deleteBody')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(shift)}>
                  {t('delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </form>

      <BottomBar>
        <Button type="submit" form={formId} size="xl" className="flex-1" disabled={busy}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {t('saveShift')}
        </Button>
      </BottomBar>
    </>
  )
}

type Translate = ReturnType<typeof useTranslations<'shiftEditor'>>

/** "9 h", "8 h 30 min" */
function hoursLabel(t: Translate, minutes: number) {
  return t('duration', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

/** "No reminders until 15:30 Sat (8 h)": sleep starts after_shift_buffer after the end (research R2). */
function sleepNote({
  t,
  end,
  settings,
  timeZone,
  time,
  weekday,
}: {
  t: Translate
  end: Date
  settings: ShiftSettings
  timeZone: string
  time: (at: Date, zone?: string) => string
  weekday: (at: Date, zone?: string) => string
}) {
  const until = new Date(
    end.getTime() + (settings.afterShiftBuffer + settings.sleepMinutes) * 60_000,
  )
  return t('sleepUntil', {
    time: time(until, timeZone),
    weekday: weekday(until, timeZone),
    duration: hoursLabel(t, settings.sleepMinutes),
  })
}

function TimeField({
  id,
  label,
  value,
  onChange,
  note,
  badge,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  note: string
  badge?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </Label>
      <div
        className={cn(
          'flex flex-col gap-0.5 rounded-2xl border bg-card px-4 py-3 focus-within:ring-3 focus-within:ring-ring/50',
          badge && 'border-2 border-shift-night',
        )}
      >
        {/* The browser shows the time in its own 12 / 24 h format (as 003's due time does). */}
        <Input
          id={id}
          type="time"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-note`}
          className={cn(
            inputClass,
            'h-9 w-full border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent',
          )}
        />
        <span
          id={`${id}-note`}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm whitespace-nowrap text-muted-foreground"
        >
          {note}
          {badge && (
            <span className="rounded-md bg-shift-night px-1.5 py-0.5 font-semibold text-shift-night-foreground">
              {badge}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

/** 08-ShiftEdit's strip: the shift drawn on 48 h from 00:00 of its day, midnight in the middle. */
function ShiftStrip({
  date,
  timeZone,
  start,
  end,
}: {
  date: string
  timeZone: string
  start: Date
  end: Date
}) {
  const t = useTranslations('shiftEditor')
  const format = useFormatter()
  const from = startOfLocalDay(date, timeZone).getTime()
  const span = 2 * DAY_MS
  const left = ((start.getTime() - from) / span) * 100
  const width = ((end.getTime() - start.getTime()) / span) * 100
  const weekdayOf = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: 'short', timeZone: 'UTC' })
  return (
    <div aria-hidden className="flex flex-col gap-1">
      <div className="relative h-10 rounded-xl bg-muted">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <span
          className="absolute inset-y-1 rounded-lg bg-shift-night"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{t('stripStart', { weekday: weekdayOf(date) })}</span>
        <span>{t('midnight')}</span>
        <span>{t('stripEnd', { weekday: weekdayOf(addCalendarDays(date, 1)) })}</span>
      </div>
    </div>
  )
}
