'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { CircleCheck, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import { AppMark } from '@/components/shared/app-mark'
import { Field, inputClass } from '@/components/shared/field'
import { PasswordInput } from '@/components/shared/password-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { unwrap } from '@/lib/result'
import { safeNext } from '@/lib/safe-next'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { signIn } from '../actions'
import { signInSchema, type Role } from '../schemas'
import { RoleCards } from './role-cards'
import { useApplySavedLook } from './use-apply-saved-look'

type Values = z.input<typeof signInSchema>

// Screens 01-Main (student) and 13-AdminSignin (admin). Google/Apple stay hidden (FR-001).
export function SignInForm() {
  const t = useTranslations('auth.signIn')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [mismatch, setMismatch] = useState<{ role: Role; home: string } | null>(null)
  const applySavedLook = useApplySavedLook()

  const form = useForm<Values, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      role: params.get('role') === 'admin' ? 'admin' : 'student',
      email: params.get('email') ?? '',
      password: '',
    },
  })
  const role = useWatch({ control: form.control, name: 'role' })
  const { errors } = form.formState

  const mutation = useMutation({
    mutationFn: async (values: z.output<typeof signInSchema>) => unwrap(await signIn(values)),
    onSuccess: (result) => {
      if (result.verify) {
        const q = new URLSearchParams({ email: result.email, t: String(result.sentAt) })
        if (next) q.set('next', next)
        router.push(`/verify-email?${q}`)
        return
      }
      applySavedLook()
      if (result.roleMismatch) {
        setMismatch({ role: result.roleMismatch, home: result.home })
        return
      }
      router.replace(next ?? result.home)
    },
  })

  const notice =
    params.get('reset') === '1'
      ? t('resetDone')
      : params.get('error') === 'link_expired'
        ? t('linkExpired')
        : null

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4 pt-6">
        <AppMark />
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="text-lg text-muted-foreground">{tc('tagline')}</p>
      </div>

      {notice && (
        <p
          className="mt-6 flex gap-3 rounded-2xl bg-accent p-4 text-sm text-accent-foreground"
          role="status"
        >
          <Info className="size-5 shrink-0" aria-hidden />
          {notice}
        </p>
      )}

      {mismatch ? (
        <section
          className="mt-8 flex flex-col gap-4 rounded-2xl border bg-card p-5"
          aria-live="polite"
        >
          <CircleCheck className="size-7 text-primary" aria-hidden />
          <h2 className="text-xl font-semibold">{t('mismatchTitle', { role: mismatch.role })}</h2>
          <p className="text-muted-foreground">{t('mismatchBody', { picked: role })}</p>
          <Button size="xl" onClick={() => router.replace(next ?? mismatch.home)}>
            {t('continueAs', { role: mismatch.role })}
          </Button>
        </section>
      ) : (
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="mt-8 flex flex-col gap-5"
        >
          <RoleCards
            legend={t('signingInAs')}
            value={role}
            onChange={(r) => form.setValue('role', r)}
            hints={{ student: t('studentHint'), admin: t('adminHint') }}
          />

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
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...form.register('password')}
            />
          </Field>

          <div className="-mt-2 flex justify-end">
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              {t('forgot')}
            </Link>
          </div>

          {mutation.isError && (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {errorMessage(mutation.error)}
            </p>
          )}

          <Button type="submit" size="xl" disabled={mutation.isPending}>
            {mutation.isPending ? tc('loading') : t('submit', { role })}
          </Button>
        </form>
      )}

      <p className="mt-auto pt-10 text-center text-muted-foreground">
        {t('newHere')}{' '}
        <Link
          href={`/sign-up?role=${role}${next ? `&next=${encodeURIComponent(next)}` : ''}`}
          className="font-semibold text-primary hover:underline"
        >
          {t('createAccount')}
        </Link>
      </p>
    </div>
  )
}
