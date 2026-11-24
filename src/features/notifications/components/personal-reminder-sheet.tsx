'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { ChoiceChip } from '@/components/shared/choice-chip'
import { Field, inputClass } from '@/components/shared/field'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { RuleView } from '@/lib/notifications/rule-config'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { deletePersonalReminder, savePersonalReminder } from '../actions'
import { notificationKeys } from '../queries'
import { savePersonalReminderSchema } from '../schemas'

// "+ Reminder" on My reminders (spec 006 US5 scenario 3; contracts/ui-routes.md › Me): a message, a
// time and the days of the week, in the student's own zone. Editing one also offers Delete. It is
// delivered like any reminder, waiting while the student is busy (US4).

type FormInput = z.input<typeof savePersonalReminderSchema>
type FormOutput = z.output<typeof savePersonalReminderSchema>

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const NEW_REMINDER: FormInput = { message: '', time: '20:00', days: WEEKDAYS, enabled: true }

export function PersonalReminderSheet({
  reminder,
  open,
  onOpenChange,
}: {
  /** The reminder to edit; none for a new one. */
  reminder: RuleView | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('myReminders')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <SheetHeader>
          <SheetTitle>{reminder ? t('editTitle') : t('newTitle')}</SheetTitle>
          <SheetDescription>{t('sheetDescription')}</SheetDescription>
        </SheetHeader>
        {/* Mounted while open, so each opening starts from the reminder as saved. */}
        {open && <ReminderForm reminder={reminder} onDone={() => onOpenChange(false)} />}
      </BottomSheetContent>
    </Sheet>
  )
}

function initialValues(reminder: RuleView | null): FormInput {
  if (reminder?.config.trigger !== 'daily') return NEW_REMINDER
  const { config, message, enabled, id } = reminder
  return { id, message, time: config.time, days: config.days, enabled }
}

function ReminderForm({ reminder, onDone }: { reminder: RuleView | null; onDone: () => void }) {
  const t = useTranslations('myReminders')
  const ts = useTranslations('ruleSummary')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const queryClient = useQueryClient()
  const uid = useId()
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  // Saving and deleting need the server (spec 008 R14).
  const connection = useNeedsConnection()

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(savePersonalReminderSchema),
    defaultValues: initialValues(reminder),
  })
  const { errors, isSubmitted } = form.formState
  const days = useWatch({ control: form.control, name: 'days' })

  const finish = async (text: string) => {
    await queryClient.invalidateQueries({ queryKey: notificationKeys.myReminders })
    toast.success(text)
    onDone()
  }
  const save = useMutation({
    mutationFn: async (values: FormOutput) => unwrap(await savePersonalReminder(values)),
    onSuccess: () => finish(t('saved')),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await deletePersonalReminder({ id })),
    onSuccess: () => finish(t('deleted')),
  })
  const failed = save.error ?? remove.error

  const toggleDay = (day: number) =>
    form.setValue(
      'days',
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
      { shouldDirty: true, shouldValidate: isSubmitted },
    )

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (connection.disabled) return
        save.mutate(values)
      })}
      className="flex flex-col gap-5 overflow-y-auto px-4 pb-8"
    >
      <Field id={`${uid}-message`} label={t('message')} error={validation(errors.message?.message)}>
        <Textarea
          id={`${uid}-message`}
          rows={2}
          placeholder={t('messagePlaceholder')}
          aria-invalid={!!errors.message}
          className="min-h-13 rounded-2xl bg-card px-4 py-3 text-base md:text-base"
          {...form.register('message')}
        />
      </Field>
      <Field id={`${uid}-time`} label={t('time')} error={validation(errors.time?.message)}>
        <Input
          id={`${uid}-time`}
          type="time"
          aria-invalid={!!errors.time}
          className={inputClass}
          {...form.register('time')}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">{t('days')}</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <ChoiceChip
              key={day}
              type="checkbox"
              checked={days.includes(day)}
              onChange={() => toggleDay(day)}
            >
              {ts('weekday', { day })}
            </ChoiceChip>
          ))}
        </div>
        {errors.days && (
          <p className="text-sm text-destructive" role="alert">
            {validation(errors.days.message ?? errors.days.root?.message)}
          </p>
        )}
      </fieldset>
      {failed && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {errorMessage(failed)}
        </p>
      )}
      <Button
        type="submit"
        size="xl"
        disabled={connection.disabled || save.isPending || remove.isPending}
        aria-describedby={connection.describedBy}
      >
        {t('save')}
      </Button>
      {reminder && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="xl"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={connection.disabled || save.isPending || remove.isPending}
            aria-describedby={connection.describedBy}
          >
            {t('delete')}
          </Button>
          <AlertDialog open={isConfirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('deleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="touch">{t('cancel')}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  size="touch"
                  disabled={connection.disabled || remove.isPending}
                  aria-describedby={connection.describedBy}
                  onClick={() => remove.mutate(reminder.id)}
                >
                  {t('delete')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </form>
  )
}
