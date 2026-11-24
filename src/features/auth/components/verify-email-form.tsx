'use client'

import { useMutation } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { CodeInput } from '@/components/shared/code-input'
import { Button } from '@/components/ui/button'
import { ActionResultError, unwrap } from '@/lib/result'
import { safeNext } from '@/lib/safe-next'
import { useErrorMessage } from '@/lib/use-error-message'
import { resendSignupCode, verifyEmailCode } from '../actions'
import { useApplySavedLook } from './use-apply-saved-look'

const COOLDOWN_MS = 60_000
const LIFETIME_MS = 60 * 60_000

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// "Open email app" is only offered on phones (research R14). Read once from the user agent;
// null on the server so the first render matches.
function emailAppLink() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'message://'
  if (/Android/i.test(ua)) {
    return 'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end'
  }
  return null
}
const noSubscribe = () => () => {}
const useEmailAppLink = () => useSyncExternalStore(noSubscribe, emailAppLink, () => null)

/** When the server says "wait n seconds", the last send was effectively this long ago. */
const sentAtFromCooldown = (seconds: number) => Date.now() - COOLDOWN_MS + seconds * 1000

// Screen 27-VerifyEmail (User Story 4).
export function VerifyEmailForm() {
  const t = useTranslations('verify')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const next = safeNext(params.get('next'))
  const [sentAt, setSentAt] = useState(() => Number(params.get('t')) || Date.now())
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const now = useNow()
  const emailApp = useEmailAppLink()
  const applySavedLook = useApplySavedLook()

  const cooldownLeft = Math.max(0, Math.ceil((sentAt + COOLDOWN_MS - now) / 1000))
  const minutesLeft = Math.max(0, Math.ceil((sentAt + LIFETIME_MS - now) / 60_000))

  const verify = useMutation({
    mutationFn: async (value: string) => unwrap(await verifyEmailCode({ email, code: value })),
    onSuccess: ({ home }) => {
      applySavedLook()
      // Invite links keep their `next` (/join/CODE) through sign-up and confirmation.
      router.replace(home === '/join' && next?.startsWith('/join') ? next : home)
    },
    onError: () => setCode(''),
  })

  const resend = useMutation({
    mutationFn: async () => unwrap(await resendSignupCode({ email })),
    onSuccess: (result) => {
      setSentAt(result.sentAt)
      verify.reset()
      setNotice(t('resent'))
    },
    onError: (error) => {
      if (error instanceof ActionResultError && error.code === 'cooldown') {
        setSentAt(sentAtFromCooldown(Number(error.params?.seconds ?? 60)))
      }
    },
  })

  const submit = (value = code) => {
    if (value.length === 6 && !verify.isPending) {
      setNotice(null)
      verify.mutate(value)
    }
  }

  const blocked =
    verify.error instanceof ActionResultError && verify.error.code === 'too_many_attempts'
  const error = verify.error ?? resend.error
  const mm = Math.floor(cooldownLeft / 60)
  const ss = String(cooldownLeft % 60).padStart(2, '0')

  return (
    <div className="flex flex-1 flex-col">
      <span className="mt-2 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Mail className="size-7" aria-hidden />
      </span>
      <h1 className="mt-6 text-[1.75rem] leading-tight font-bold tracking-tight">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {t.rich('body', {
          email,
          b: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </p>

      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <CodeInput
          value={code}
          onChange={setCode}
          onComplete={submit}
          label={t('codeLabel')}
          invalid={verify.isError}
          disabled={blocked || verify.isPending}
          autoFocus
        />

        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">{t('expires', { minutes: minutesLeft })}</span>
          {cooldownLeft > 0 ? (
            <span className="font-semibold text-muted-foreground" aria-live="off">
              {t('resendIn', { time: `${mm}:${ss}` })}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="-mr-2 min-h-11 rounded-lg px-2 font-semibold text-primary hover:underline"
            >
              {t('resend')}
            </button>
          )}
        </div>

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

        <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4 text-muted-foreground">
          <p>{t('spam')}</p>
          <p>
            {t('wrongAddress')}{' '}
            <Link
              href={`/sign-up?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`}
              className="font-semibold text-primary hover:underline"
            >
              {t('changeEmail')}
            </Link>
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-10">
          <Button type="submit" size="xl" disabled={code.length < 6 || verify.isPending || blocked}>
            {verify.isPending ? tc('loading') : t('submit')}
          </Button>
          {emailApp && (
            <Button asChild variant="outline" size="xl">
              <a href={emailApp}>{t('openApp')}</a>
            </Button>
          )}
          <p className="text-center text-sm text-muted-foreground">{t('after')}</p>
        </div>
      </form>
    </div>
  )
}
