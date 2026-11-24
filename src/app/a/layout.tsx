import { redirect } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { AppearanceSync } from '@/components/shared/appearance-sync'
import { MarkReadOnOpen } from '@/features/notifications/components/mark-read-on-open'
import { InstallPrompt } from '@/features/pwa/components/install-prompt'
import { OfflineBanner } from '@/features/pwa/components/offline-banner'
import { OfflineRuntime } from '@/features/pwa/components/offline-runtime'
import { UpdateToast } from '@/features/pwa/components/update-toast'
import { toAppearance } from '@/lib/appearance'
import { PersistQueries } from '@/lib/query/persist-queries'
import { requirePageUser } from '@/server/auth/page-guard'

// Admin area: authoritative role check (the proxy's check is only optimistic).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  if (me.role !== 'admin') redirect('/s/today')
  return (
    // Spec 008 FR-004: this user's data saved on the device; OfflineRuntime clears anyone else's.
    <PersistQueries userId={me.id}>
      <OfflineBanner userId={me.id} role="admin" />
      {children}
      <OfflineRuntime userId={me.id} role="admin" />
      <AppearanceSync appearance={toAppearance(me)} />
      {/* Spec 008 US1 and US3. */}
      <InstallPrompt />
      <UpdateToast />
      {/* Spec 006: a tapped notification's ?n=<id>, and the bell after a push. */}
      <Suspense fallback={null}>
        <MarkReadOnOpen />
      </Suspense>
    </PersistQueries>
  )
}
