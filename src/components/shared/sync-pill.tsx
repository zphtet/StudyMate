'use client'

import { CloudUpload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePendingChange } from '@/lib/offline/use-pending-change'
import { cn } from '@/lib/utils'

/**
 * "Will sync" (or "Will submit") on a record changed offline and not yet sent (spec 008 US2
 * scenarios 2–3; contracts/ui-routes.md › SyncPill). Renders nothing once it has synced.
 */
export function SyncPill({ recordKey, className }: { recordKey: string; className?: string }) {
  const t = useTranslations('pwa')
  const change = usePendingChange(recordKey)
  if (!change) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <CloudUpload className="size-3.5" aria-hidden />
      {t(change.type === 'submission.submit' ? 'willSubmit' : 'willSync')}
    </span>
  )
}
