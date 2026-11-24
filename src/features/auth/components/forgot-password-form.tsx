'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Check, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Field, inputClass } from '@/components/shared/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { requestPasswordReset } from '../actions'
import { emailOnlySchema } from '../schemas'

/** The reset screen's link: the email, and when the code was sent (for the "Send again" wait). */
export const resetHref = (email: string, sentAt: number) =>
  `/reset-password?email=${encodeURIComponent(email)}&t=${sentAt}`

// Screen 28-ForgotPassword (User Story 5 scenario 1): the same answer for every email (FR-012).
export function ForgotPasswordForm() {
  const t = useTranslations('reset')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const params = useSearchParams()
  type Values = z.input<typeof emailOnlySchema>
  const form = useForm<Values, unknown, z.output<typeof emailOnlySchema>>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: params.get('email') ?? '' },
  })
  const { errors } = form.formState

  const send = useMutation({
    mutationFn: async (values: z.output<typeof emailOnlySchema>) => ({
      email: values.email,
      ...unwrap(await requestPasswordReset(values)),
    }),
  })

  return (
    <div className="flex flex-1 flex-col">
      <span className="mt-2 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Lock className="size-7" aria-hidden />
      </span>
      <h1 className="mt-6 text-[1.75rem] leading-tight font-bold tracking-tight">
        {t('forgotTitle')}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('forgotBody')}</p>

      <form
        noValidate
        onSubmit={form.handleSubmit((values) => send.mutate(values))}
        className="mt-6 flex flex-col gap-5"
      >
        <Field id="email" label={tc('email')} error={validation(errors.email?.message)}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            className={inputClass}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...form.register('email', { onChange: () => send.reset() })}
          />
        </Field>

        {send.isSuccess ? (
          <Button
            type="button"
            size="xl"
            onClick={() => router.push(resetHref(send.data.email, send.data.sentAt))}
          >
            {t('enterCode')}
          </Button>
        ) : (
          <Button type="submit" size="xl" disabled={send.isPending}>
            {send.isPending ? tc('loading') : t('send')}
          </Button>
        )}

        {send.isSuccess && (
          <p
            role="status"
            className="flex gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-success"
          >
            <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
            {t('sent')}
          </p>
        )}
        {send.isError && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(send.error)}
          </p>
        )}
      </form>

      <p className="mt-auto pt-10 text-center text-muted-foreground">
        {t('remembered')}{' '}
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
        >
          {t('backToSignIn')}
        </Link>
      </p>
    </div>
  )
}
