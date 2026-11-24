'use client'

import { useTranslations } from 'next-intl'
import { useId, type ReactNode } from 'react'
import { useOnline } from './use-online'

type ControlProps = { disabled: boolean; 'aria-describedby'?: string }

/**
 * A write that needs the server (spec 008 US2 scenario 4; research R14): offline, the control stays
 * where it is, disabled, with "Needs a connection" underneath and linked to it for screen readers.
 * Callers combine `disabled` with their own: `disabled={offline.disabled || isPending}`.
 */
export function OnlineOnly({
  children,
  className,
}: {
  children: (control: ControlProps) => ReactNode
  className?: string
}) {
  const t = useTranslations('pwa')
  const isOnline = useOnline()
  const reasonId = useId()
  return (
    <>
      {children(isOnline ? { disabled: false } : { disabled: true, 'aria-describedby': reasonId })}
      {!isOnline && (
        <p id={reasonId} className={className ?? 'text-sm text-muted-foreground'}>
          {t('needsConnection')}
        </p>
      )}
    </>
  )
}
