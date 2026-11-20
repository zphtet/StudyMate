'use client'

import { Check, Circle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

// Live password rules (FR-013, screenshot 29-ResetPassword). Pass `confirm` to show "Passwords match".
export function PasswordChecks({ password, confirm }: { password: string; confirm?: string }) {
  const t = useTranslations('auth.password')
  const checks = [
    { ok: password.length >= 8, label: t('length') },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: t('letterDigit') },
    ...(confirm !== undefined
      ? [{ ok: confirm.length > 0 && confirm === password, label: t('match') }]
      : []),
  ]
  return (
    <ul className="flex flex-col gap-1.5 text-sm" aria-live="polite">
      {checks.map(({ ok, label }) => (
        <li
          key={label}
          className={cn('flex items-center gap-2', ok ? 'text-success' : 'text-muted-foreground')}
        >
          {ok ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Circle className="size-4" aria-hidden />
          )}
          <span>
            {label}
            <span className="sr-only">{ok ? ' ✓' : ''}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
