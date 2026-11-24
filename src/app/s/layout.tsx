import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { AppearanceSync } from '@/components/shared/appearance-sync'
import { MarkReadOnOpen } from '@/features/notifications/components/mark-read-on-open'
import { InstallPrompt } from '@/features/pwa/components/install-prompt'
import { OfflineRuntime } from '@/features/pwa/components/offline-runtime'
import { hasActiveLink } from '@/features/links/repo'
import { toAppearance } from '@/lib/appearance'
import { PersistQueries } from '@/lib/query/persist-queries'
import { requirePageUser } from '@/server/auth/page-guard'

// Student area (contracts/ui-routes.md); the tab bar lives in (tabs)/layout.tsx (spec 002).
// Authoritative checks: signed-in student, and an active link before any app content (FR-004),
// except Me, so they can still manage their account.
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  if (me.role !== 'student') redirect('/a/students')
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (!pathname.startsWith('/s/me') && !(await hasActiveLink(me.id))) redirect('/join')

  return (
    // Spec 008 FR-004: this user's data saved on the device; OfflineRuntime clears anyone else's.
    <PersistQueries userId={me.id}>
      {children}
      <OfflineRuntime userId={me.id} role="student" />
      <AppearanceSync appearance={toAppearance(me)} />
      {/* Spec 008 US1. */}
      <InstallPrompt />
      {/* Spec 006: a tapped notification's ?n=<id>, and the bell after a push. */}
      <Suspense fallback={null}>
        <MarkReadOnOpen />
      </Suspense>
    </PersistQueries>
  )
}
