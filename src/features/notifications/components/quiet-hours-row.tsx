'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Moon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { Field, inputClass } from '@/components/shared/field'
import { Segmented } from '@/components/shared/segmented'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { SettingsRow } from '@/components/shared/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { saveQuietHours } from '../actions'
import { myRemindersQuery, notificationKeys } from '../queries'
import { quietHoursText } from '../quiet-hours'
import { saveQuietHoursSchema } from '../schemas'
import type { MyReminders } from '../types'

// "Quiet hours" on Me, both roles (spec 006 US5 scenario 1; research R14; 11-Profile.png): the row
// reads "While on shift + sleep" / "22:00–07:00 + shift and sleep" for a student, "Off" / the window
// for an Admin, and opens a sheet with None, or From and To (a window may cross midnight).

type Role = 'student' | 'admin'
type Window = MyReminders['quietHours']

export function QuietHoursRow({ role }: { role: Role }) {
  const t = useTranslations('quietHours')
  const { data } = useQuery(myRemindersQuery)
  const [open, setOpen] = useState(false)

  const value = (() => {
    if (!data) return ''
    const text = quietHoursText({
      role,
      start: data.quietHours?.start ?? null,
      end: data.quietHours?.end ?? null,
    })
    return 'window' in text ? t(text.key, { window: text.window }) : t(text.key)
  })()

  return (
    <>
      <SettingsRow
        onClick={() => setOpen(true)}
        icon={<Moon className="size-5 text-primary" aria-hidden />}
        label={t('row')}
        value={value}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent>
          <SheetHeader>
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>
              {role === 'student' ? t('descriptionStudent') : t('descriptionAdmin')}
            </SheetDescription>
          </SheetHeader>
          {/* Mounted while open, so it starts from the saved window each time. */}
          {open && data && (
            <QuietHoursForm saved={data.quietHours} onSaved={() => setOpen(false)} />
          )}
        </BottomSheetContent>
      </Sheet>
    </>
  )
}

/** A window to start from when none is set: the night (FR-013 example). */
const SUGGESTED = { start: '22:00', end: '07:00' }

function QuietHoursForm({ saved, onSaved }: { saved: Window; onSaved: () => void }) {
  const t = useTranslations('quietHours')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const queryClient = useQueryClient()
  const uid = useId()
  const [mode, setMode] = useState<'none' | 'set'>(saved ? 'set' : 'none')
  const [start, setStart] = useState(saved?.start ?? SUGGESTED.start)
  const [end, setEnd] = useState(saved?.end ?? SUGGESTED.end)
  const [invalid, setInvalid] = useState<string>()
  // Saving needs the server (spec 008 R14).
  const connection = useNeedsConnection()

  const save = useMutation({
    mutationFn: async (input: Parameters<typeof saveQuietHours>[0]) =>
      unwrap(await saveQuietHours(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.myReminders })
      onSaved()
    },
  })

  const submit = () => {
    if (connection.disabled) return
    // The actions' schema, so the sheet and the server agree (CLAUDE.md › One source of truth).
    const parsed = saveQuietHoursSchema.safeParse(
      mode === 'none' ? { start: null, end: null } : { start, end },
    )
    if (!parsed.success) {
      setInvalid(validation(parsed.error.issues[0]?.message))
      return
    }
    setInvalid(undefined)
    save.mutate(parsed.data)
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-5 px-4 pb-8"
    >
      <Segmented
        name={`${uid}-mode`}
        legend={t('title')}
        value={mode}
        options={[
          { value: 'none', label: t('none') },
          { value: 'set', label: t('set') },
        ]}
        onChange={setMode}
      />
      {mode === 'set' && (
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${uid}-from`} label={t('from')}>
            <Input
              id={`${uid}-from`}
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id={`${uid}-to`} label={t('to')} error={invalid}>
            <Input
              id={`${uid}-to`}
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              aria-invalid={!!invalid}
              aria-describedby={invalid ? `${uid}-to-error` : undefined}
              className={inputClass}
            />
          </Field>
        </div>
      )}
      {save.isError && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <Button
        type="submit"
        size="xl"
        disabled={connection.disabled || save.isPending}
        aria-describedby={connection.describedBy}
      >
        {t('save')}
      </Button>
    </form>
  )
}
