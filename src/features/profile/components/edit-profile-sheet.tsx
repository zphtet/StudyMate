'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field, inputClass } from '@/components/shared/field'
import { TimezonePicker } from '@/components/shared/timezone-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { displayNameSchema, timezoneSchema } from '@/features/auth/schemas'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { updateProfile } from '../actions'
import { meQuery } from '../queries'
import type { MeResponse } from '../types'

const formSchema = z.object({ displayName: displayNameSchema, timezone: timezoneSchema })
type Values = z.input<typeof formSchema>

// "Edit" on Me: name and time zone (FR-007). The avatar initial follows the name.
export function EditProfileSheet({ me }: { me: MeResponse }) {
  const t = useTranslations('me')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const form = useForm<Values, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: { displayName: me.displayName, timezone: me.timezone },
  })
  const timezone = useWatch({ control: form.control, name: 'timezone' })
  const { errors } = form.formState

  const save = useMutation({
    mutationFn: async (values: z.output<typeof formSchema>) => unwrap(await updateProfile(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      setOpen(false)
      toast.success(t('saved'))
      router.refresh() // times re-render in the new zone (spec User Story 3, scenario 1)
    },
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="touch" className="rounded-full px-6">
          {t('edit')}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{t('editTitle')}</SheetTitle>
          <SheetDescription className="sr-only">{t('editTitle')}</SheetDescription>
        </SheetHeader>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-5 px-4 pb-6"
        >
          <Field id="edit-name" label={t('name')} error={validation(errors.displayName?.message)}>
            <Input
              id="edit-name"
              autoComplete="name"
              className={inputClass}
              aria-invalid={!!errors.displayName}
              {...form.register('displayName')}
            />
          </Field>
          <TimezonePicker
            value={timezone}
            detected={false}
            onChange={(zone) => form.setValue('timezone', zone, { shouldDirty: true })}
          />
          {save.isError && (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {errorMessage(save.error)}
            </p>
          )}
          <Button type="submit" size="xl" disabled={save.isPending}>
            {t('save')}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
