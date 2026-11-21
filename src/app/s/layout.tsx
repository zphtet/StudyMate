import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ThemeSync } from '@/components/shared/theme-sync'
import { hasActiveLink } from '@/features/links/repo'
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
    <>
      {children}
      <ThemeSync mode={me.colorMode} />
    </>
  )
}
