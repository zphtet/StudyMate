'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import { CodeInput } from '@/components/shared/code-input'
import { Field } from '@/components/shared/field'
import { PasswordChecks } from '@/components/shared/password-checks'
import { PasswordInput } from '@/components/shared/password-input'
import { Button } from '@/components/ui/button'
import { ActionResultError, unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { requestPasswordReset, resetPassword } from '../actions'
import { resetPasswordSchema } from '../schemas'

const COOLDOWN_MS = 60_000

/** When the server says "wait n seconds", the last send was effectively this long ago. */
const sentAtFromCooldown = (seconds: number) => Date.now() - COOLDOWN_MS + seconds * 1000

// Screen 29-ResetPassword (User Story 5 scenarios 2–4): the emailed code, the new password twice
// with live checks, then sign in again (every session was signed out).
export function ResetPasswordForm() {
  const t = useTranslations('reset')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const [sentAt, setSentAt] = useState(() => Number(params.get('t')) || Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const now = useNow({ updateInterval: 1000 }).getTime()
  const cooldownLeft = Math.max(0, Math.ceil((sentAt + COOLDOWN_MS - now) / 1000))

  type Values = z.input<typeof resetPasswordSchema>
  const form = useForm<Values, unknown, z.output<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, code: '', password: '', confirm: '' },
  })
  const [password, confirm] = useWatch({ control: form.control, name: ['password', 'confirm'] })
  const { errors } = form.formState

  const reset = useMutation({
    mutationFn: async (values: z.output<typeof resetPasswordSchema>) =>
      unwrap(await resetPassword(values)),
    onSuccess: () => router.replace(`/sign-in?reset=1&email=${encodeURIComponent(email)}`),
    onError: () => form.setValue('code', ''),
  })

  const resend = useMutation({
    mutationFn: async () => unwrap(await requestPasswordReset({ email })),
    onSuccess: (result) => {
      setSentAt(result.sentAt)
      reset.reset()
      setNotice(t('resent'))
    },
    onError: (error) => {
      if (error instanceof ActionResultError && error.code === 'cooldown') {
        setSentAt(sentAtFromCooldown(Number(error.params?.seconds ?? 60)))
      }
    },
  })

  if (!email) {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="mt-6 text-[1.75rem] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('noEmail')}</p>
        <Button asChild size="xl" className="mt-8">
          <Link href="/forgot-password">{t('forgotTitle')}</Link>
        </Button>
      </div>
    )
  }

  const isBlocked =
    reset.error instanceof ActionResultError && reset.error.code === 'too_many_attempts'
  const error = reset.error ?? resend.error
  const mm = Math.floor(cooldownLeft / 60)
  const ss = String(cooldownLeft % 60).padStart(2, '0')

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setNotice(null)
        reset.mutate(values)
      })}
      className="flex flex-1 flex-col"
    >
      <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {t.rich('body', {
          email,
          b: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground" aria-hidden>
            {t('codeLabel')}
          </p>
          <Controller
            control={form.control}
            name="code"
            render={({ field }) => (
              <CodeInput
                value={field.value}
                onChange={field.onChange}
                label={t('codeLabel')}
                invalid={!!errors.code || reset.isError}
                disabled={isBlocked || reset.isPending}
                autoFocus
              />
            )}
          />
          {errors.code && (
            <p className="text-sm text-destructive" role="alert">
              {validation(errors.code.message)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t('notReceived')}{' '}
            {cooldownLeft > 0 ? (
              <span className="font-semibold" aria-live="off">
                {t('sendAgainIn', { time: `${mm}:${ss}` })}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => resend.mutate()}
                disabled={resend.isPending}
                className="-mx-1 inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-primary hover:underline"
              >
                {t('sendAgain')}
              </button>
            )}
          </p>
        </div>

        <Field id="password" label={t('newPassword')} error={validation(errors.password?.message)}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...form.register('password')}
          />
        </Field>
        <Field
          id="confirm"
          label={t('confirmPassword')}
          error={validation(errors.confirm?.message)}
        >
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? 'confirm-error' : undefined}
            {...form.register('confirm')}
          />
        </Field>
        <PasswordChecks password={password} confirm={confirm} />

        {(error || notice) && (
          <p
            role={error ? 'alert' : 'status'}
            className={
              error
                ? 'rounded-xl bg-destructive/10 p-3 text-sm text-destructive'
                : 'rounded-xl bg-accent p-3 text-sm text-accent-foreground'
            }
          >
            {error ? errorMessage(error) : notice}
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-10">
        <Button type="submit" size="xl" disabled={reset.isPending || isBlocked}>
          {reset.isPending ? tc('loading') : t('submit')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">{t('signedOutElsewhere')}</p>
      </div>
    </form>
  )
}
