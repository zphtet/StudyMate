'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Field, inputClass } from '@/components/shared/field'
import { PasswordChecks } from '@/components/shared/password-checks'
import { PasswordInput } from '@/components/shared/password-input'
import {
  AlertDialog,
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
import { changePassword } from '@/features/auth/actions'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { deleteAccount } from '../actions'
import { meQuery } from '../queries'
import { changePasswordSchema } from '../schemas'

// Account and password (contracts/ui-routes.md): change password, delete account.
// "Leave admin" joins this screen with User Story 2 (linking).
export function AccountView() {
  return (
    <div className="flex flex-col gap-8">
      <ChangePasswordForm />
      <DeleteAccount />
    </div>
  )
}

function ChangePasswordForm() {
  const t = useTranslations('account')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  type Values = z.input<typeof changePasswordSchema>
  const form = useForm<Values, unknown, z.output<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  })
  const newPassword = useWatch({ control: form.control, name: 'newPassword' })
  const { errors } = form.formState

  const save = useMutation({
    mutationFn: async (values: z.output<typeof changePasswordSchema>) =>
      unwrap(await changePassword(values)),
    onSuccess: () => {
      form.reset()
      toast.success(t('changed'))
    },
  })

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('changePassword')}</h2>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="flex flex-col gap-4 rounded-2xl border bg-card p-4"
      >
        <Field
          id="current"
          label={t('current')}
          error={validation(errors.currentPassword?.message)}
        >
          <PasswordInput
            id="current"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...form.register('currentPassword')}
          />
        </Field>
        <Field id="new" label={t('new')} error={validation(errors.newPassword?.message)}>
          <PasswordInput
            id="new"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            {...form.register('newPassword')}
          />
          <PasswordChecks password={newPassword} />
        </Field>
        {save.isError && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <Button type="submit" size="xl" disabled={save.isPending}>
          {save.isPending ? tc('loading') : t('save')}
        </Button>
      </form>
    </section>
  )
}

function DeleteAccount() {
  const t = useTranslations('account')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const { data: me } = useSuspenseQuery(meQuery)
  const [confirm, setConfirm] = useState('')

  const remove = useMutation({
    mutationFn: async () => unwrap(await deleteAccount({ confirm })),
    // Full reload: the account is gone, so no cached query may refetch.
    onSuccess: () => window.location.replace('/sign-in'),
  })

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('deleteTitle')}</h2>
      <p className="text-muted-foreground">
        {t('deleteBody')} {me.role === 'admin' && t('deleteAdminNote')}
      </p>
      <AlertDialog onOpenChange={(open) => !open && setConfirm('')}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="xl"
            className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            {t('deleteButton')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label={t('confirmLabel')}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
          {remove.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(remove.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirm !== 'DELETE' || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t('confirmAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
