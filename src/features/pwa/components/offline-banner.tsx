'use client'

import { CloudOff, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { NEEDS_CONNECTION_ID } from '@/components/shared/use-needs-connection'
import { useOnline } from '@/components/shared/use-online'
import { useOutboxState } from '@/lib/offline/sync'
import { DroppedChangesSheet } from './dropped-changes-sheet'

// The one line that says why the app looks the way it does (spec 008 US2 scenario 4; research R14;
// contracts/ui-routes.md › OfflineBanner): offline, changes waiting or syncing, sync paused until
// sign-in, or changes the server refused. A polite live region above the page; never over the tab
// bar. Admins have nothing to queue, so offline they only see that data is the saved copy.

export function OfflineBanner({ userId, role }: { userId: string; role: 'student' | 'admin' }) {
  const t = useTranslations('pwa.banner')
  const isOnline = useOnline()
  const pathname = usePathname()
  const { pending, dropped, isSyncing, isPaused } = useOutboxState(userId)
  const [isSheetOpen, setSheetOpen] = useState(false)

  // A toast when the server refuses something, once per new batch of refusals.
  const toastedCount = useRef(0)
  useEffect(() => {
    if (dropped.length > toastedCount.current) {
      toast(t('notSaved', { count: dropped.length }), {
        id: 'dropped-changes',
        action: { label: t('view'), onClick: () => setSheetOpen(true) },
      })
    }
    toastedCount.current = dropped.length
  }, [dropped.length, t])

  const message = isPaused
    ? t('paused')
    : !isOnline
      ? role === 'admin'
        ? t('offlineAdmin')
        : pending > 0
          ? t('offlineWaiting', { count: pending })
          : t('offline')
      : pending > 0 || isSyncing
        ? t('syncing', { count: pending })
        : dropped.length > 0
          ? t('notSaved', { count: dropped.length })
          : null

  return (
    <>
      {message && (
        <div
          role="status"
          className="flex min-h-9 items-center justify-center gap-2 bg-muted px-4 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-center text-sm text-muted-foreground"
        >
          {isOnline && !isPaused ? (
            <RefreshCw className="size-4 shrink-0" aria-hidden />
          ) : (
            <CloudOff className="size-4 shrink-0" aria-hidden />
          )}
          <span>
            {message}
            {/* Why other writes are disabled (R14): said once, pointed to by each control. */}
            {!isOnline && !isPaused && (
              <>
                {' · '}
                <span id={NEEDS_CONNECTION_ID}>{t('needsConnection')}</span>
              </>
            )}
          </span>
          {isPaused && (
            <Link
              href={`/sign-in?next=${encodeURIComponent(pathname)}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {t('signIn')}
            </Link>
          )}
          {!isPaused && dropped.length > 0 && (
            <button
              type="button"
              className="min-h-9 font-medium text-foreground underline underline-offset-4"
              onClick={() => setSheetOpen(true)}
            >
              {t('view')}
            </button>
          )}
        </div>
      )}
      <DroppedChangesSheet entries={dropped} open={isSheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
