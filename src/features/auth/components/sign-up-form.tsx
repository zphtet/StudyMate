'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import { Field, inputClass } from '@/components/shared/field'
import { PasswordChecks } from '@/components/shared/password-checks'
import { PasswordInput } from '@/components/shared/password-input'
import { TimezonePicker, detectTimeZone } from '@/components/shared/timezone-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasLocale } from '@/i18n/locales'
import { unwrap } from '@/lib/result'
import { safeNext } from '@/lib/safe-next'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { signUp } from '../actions'
import { signUpSchema } from '../schemas'
import { RoleCards } from './role-cards'

type Values = z.input<typeof signUpSchema>

// Screens 02-Signup (student) and 14-AdminSignup (admin). Role is chosen once (FR-002).
export function SignUpForm() {
  const t = useTranslations('auth.signUp')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const params = useSearchParams()
  const locale = useLocale()
  const next = safeNext(params.get('next'))
  const [detected, setDetected] = useState(true)

  const form = useForm<Values, unknown, z.output<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      role: params.get('role') === 'admin' ? 'admin' : 'student',
      displayName: '',
      email: params.get('email') ?? '',
      password: '',
      timezone: 'UTC',
      locale: hasLocale(locale) ? locale : 'en',
    },
  })
  const [role, password, timezone] = useWatch({
    control: form.control,
    name: ['role', 'password', 'timezone'],
  })
  const { errors } = form.formState

  // The device's zone is only known in the browser (research R14).
  useEffect(() => {
    form.setValue('timezone', detectTimeZone())
  }, [form])

  const mutation = useMutation({
    mutationFn: async (values: z.output<typeof signUpSchema>) => unwrap(await signUp(values)),
    onSuccess: ({ email, sentAt }) => {
      const q = new URLSearchParams({ email, t: String(sentAt) })
      if (next) q.set('next', next)
      router.push(`/verify-email?${q}`)
    },
  })

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="text-lg text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form
        noValidate
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="mt-6 flex flex-col gap-5"
      >
        <RoleCards
          value={role}
          onChange={(r) => form.setValue('role', r)}
          hints={{ student: t('studentHint'), admin: t('adminHint') }}
        />

        <Field id="displayName" label={t('name')} error={validation(errors.displayName?.message)}>
          <Input
            id="displayName"
            autoComplete="name"
            className={inputClass}
            aria-invalid={!!errors.displayName}
            aria-describedby={errors.displayName ? 'displayName-error' : undefined}
            {...form.register('displayName')}
          />
        </Field>

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
            {...form.register('email')}
          />
        </Field>

        <Field id="password" label={tc('password')} error={validation(errors.password?.message)}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-checks"
            {...form.register('password')}
          />
          <div id="password-checks">
            <PasswordChecks password={password} />
          </div>
        </Field>

        <TimezonePicker
          value={timezone}
          detected={detected}
          onChange={(zone) => {
            form.setValue('timezone', zone, { shouldValidate: true })
            setDetected(false)
          }}
        />

        <p className="flex items-center gap-3 rounded-2xl bg-accent p-4 text-accent-foreground">
          <Mail className="size-5 shrink-0" aria-hidden />
          {t('codeInfo')}
        </p>

        {mutation.isError && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {errorMessage(mutation.error)}
          </p>
        )}

        <Button type="submit" size="xl" disabled={mutation.isPending}>
          {mutation.isPending ? tc('loading') : t('submit', { role })}
        </Button>
      </form>

      <p className="mt-auto pt-8 text-center text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link
          href={`/sign-in?role=${role}${next ? `&next=${encodeURIComponent(next)}` : ''}`}
          className="font-semibold text-primary hover:underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </div>
  )
}
