'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { Field, inputClass } from '@/components/shared/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { saveShiftSettings } from '../actions'
import { shiftKeys, shiftSettingsQuery } from '../queries'
import { shiftSettingsSchema, type ShiftSettingsInput } from '../schemas'
import type { ShiftSettings } from '../types'

// Shift settings sheet (spec 005 FR-002–FR-004; research R10): the Day / Evening / Night preset
// times used by Add shift and the rotation, the sleep length after a shift (4–12 h in 30 min steps)
// and the waking hours. One Zod schema with the action.

const PRESETS = [
  ['D', 'day'],
  ['E', 'evening'],
  ['N', 'night'],
] as const
const SLEEP_OPTIONS = Array.from({ length: 17 }, (_, i) => 240 + i * 30)

export function ShiftSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="mx-auto max-h-[92dvh] max-w-xl overflow-y-auto">
        <SettingsBody onDone={() => onOpenChange(false)} />
      </BottomSheetContent>
    </Sheet>
  )
}

function SettingsBody({ onDone }: { onDone: () => void }) {
  const t = useTranslations('shiftSettings')
  const { data } = useQuery(shiftSettingsQuery)
  return (
    <>
      <SheetHeader className="text-left">
        <SheetTitle className="text-2xl leading-tight font-bold">{t('title')}</SheetTitle>
        <SheetDescription className="text-base">{t('description')}</SheetDescription>
      </SheetHeader>
      {data ? (
        <SettingsForm settings={data.settings} onDone={onDone} />
      ) : (
        <div className="flex justify-center p-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}
    </>
  )
}

/** Field errors by the Zod issue path ("presets.N", "wakingEnd"). */
function fieldErrors(input: ShiftSettingsInput) {
  const result = shiftSettingsSchema.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map((i) => [i.path.slice(0, 2).join('.'), i.message]),
  )
}

function SettingsForm({ settings, onDone }: { settings: ShiftSettings; onDone: () => void }) {
  const t = useTranslations('shiftSettings')
  const tTypes = useTranslations('shifts.types')
  const tEditor = useTranslations('shiftEditor')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const queryClient = useQueryClient()
  const uid = useId()
  const [form, setForm] = useState<ShiftSettingsInput>(() => ({
    presets: settings.presets,
    sleepMinutes: settings.sleepMinutes,
    wakingStart: settings.wakingStart,
    wakingEnd: settings.wakingEnd,
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: async () => unwrap(await saveShiftSettings(form)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shiftKeys.all })
      toast.success(t('saved'))
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = fieldErrors(form)
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate()
  }
  const setPreset = (key: 'D' | 'E' | 'N', index: 0 | 1, value: string) =>
    setForm((f) => {
      const pair: [string, string] = [...f.presets[key]]
      pair[index] = value
      return { ...f, presets: { ...f.presets, [key]: pair } }
    })
  const hours = (minutes: number) =>
    tEditor('duration', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6 px-4 pb-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-lg font-semibold">{t('presets')}</legend>
        {PRESETS.map(([key, type]) => {
          const name = tTypes(type)
          const error = validation(errors[`presets.${key}`])
          return (
            <div key={key} className="grid grid-cols-2 gap-3">
              <Field id={`${uid}-${key}-start`} label={t('starts', { type: name })}>
                <Input
                  id={`${uid}-${key}-start`}
                  type="time"
                  required
                  value={form.presets[key][0]}
                  onChange={(e) => setPreset(key, 0, e.target.value)}
                  aria-invalid={Boolean(error)}
                  className={inputClass}
                />
              </Field>
              <Field id={`${uid}-${key}-end`} label={t('ends', { type: name })} error={error}>
                <Input
                  id={`${uid}-${key}-end`}
                  type="time"
                  required
                  value={form.presets[key][1]}
                  onChange={(e) => setPreset(key, 1, e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${uid}-${key}-end-error` : undefined}
                  className={inputClass}
                />
              </Field>
            </div>
          )
        })}
      </fieldset>

      <Field id={`${uid}-sleep`} label={t('sleep')}>
        <select
          id={`${uid}-sleep`}
          value={form.sleepMinutes}
          onChange={(e) => setForm((f) => ({ ...f, sleepMinutes: Number(e.target.value) }))}
          className={cn(inputClass, 'border border-input')}
        >
          {SLEEP_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {hours(minutes)}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t('waking')}</legend>
        <p className="text-sm text-muted-foreground">{t('wakingHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${uid}-wake`} label={t('wakingFrom')}>
            <Input
              id={`${uid}-wake`}
              type="time"
              required
              value={form.wakingStart}
              onChange={(e) => setForm((f) => ({ ...f, wakingStart: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field id={`${uid}-sleep-at`} label={t('wakingTo')} error={validation(errors.wakingEnd)}>
            <Input
              id={`${uid}-sleep-at`}
              type="time"
              required
              value={form.wakingEnd}
              onChange={(e) => setForm((f) => ({ ...f, wakingEnd: e.target.value }))}
              aria-invalid={Boolean(errors.wakingEnd)}
              aria-describedby={errors.wakingEnd ? `${uid}-sleep-at-error` : undefined}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <Button type="submit" size="xl" disabled={save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('save')}
      </Button>
    </form>
  )
}
