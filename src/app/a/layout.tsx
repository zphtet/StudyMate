import { redirect } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { AppearanceSync } from '@/components/shared/appearance-sync'
import { MarkReadOnOpen } from '@/features/notifications/components/mark-read-on-open'
import { toAppearance } from '@/lib/appearance'
import { requirePageUser } from '@/server/auth/page-guard'

// Admin area: authoritative role check (the proxy's check is only optimistic).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  if (me.role !== 'admin') redirect('/s/today')
  return (
    <>
      {children}
      <AppearanceSync appearance={toAppearance(me)} />
      {/* Spec 006: a tapped notification's ?n=<id>, and the bell after a push. */}
      <Suspense fallback={null}>
        <MarkReadOnOpen />
      </Suspense>
    </>
  )
}
