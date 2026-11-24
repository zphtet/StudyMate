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
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
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
import { leaveAdmin } from '@/features/links/actions'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { deleteAccount } from '../actions'
import { meQuery } from '../queries'
import { changePasswordSchema } from '../schemas'

// Account and password (contracts/ui-routes.md): change password, leave admin (students), delete
// account.
export function AccountView() {
  const { data: me } = useSuspenseQuery(meQuery)
  return (
    <div className="flex flex-col gap-8">
      <ChangePasswordForm />
      {me.link?.status === 'active' && <LeaveAdmin admin={me.link.admin.displayName} />}
      <DeleteAccount />
    </div>
  )
}

/** Spec 001 Edge Cases: the student keeps their own history and loses the admin's courses. */
function LeaveAdmin({ admin }: { admin: string }) {
  const t = useTranslations('account')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const connection = useNeedsConnection()

  const leave = useMutation({
    mutationFn: async () => unwrap(await leaveAdmin({})),
    // Full load: the admin's courses must leave the cache, and the app sends an unlinked student to
    // /join.
    onSuccess: () => window.location.replace('/join'),
  })

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('leaveTitle')}</h2>
      <p className="text-muted-foreground">{t('leaveBody', { name: admin })}</p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="xl"
            disabled={connection.disabled}
            aria-describedby={connection.describedBy}
          >
            {t('leaveButton', { name: admin })}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leaveConfirmTitle', { name: admin })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leaveConfirmBody', { name: admin })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {leave.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(leave.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={connection.disabled || leave.isPending}
              aria-describedby={connection.describedBy}
              onClick={() => leave.mutate()}
            >
              {t('leaveConfirmAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
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
  // Changing the password and deleting the account need the server (spec 008 R14).
  const connection = useNeedsConnection()

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
        onSubmit={form.handleSubmit((values) => {
          if (connection.disabled) return
          save.mutate(values)
        })}
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
        <Button
          type="submit"
          size="xl"
          disabled={connection.disabled || save.isPending}
          aria-describedby={connection.describedBy}
        >
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
  const connection = useNeedsConnection()

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
            disabled={connection.disabled}
            aria-describedby={connection.describedBy}
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
              disabled={connection.disabled || confirm !== 'DELETE' || remove.isPending}
              aria-describedby={connection.describedBy}
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
