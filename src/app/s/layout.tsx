import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { StudentNav } from '@/components/layout/student-nav'
import { ThemeSync } from '@/components/shared/theme-sync'
import { hasActiveLink } from '@/features/links/repo'
import { requirePageUser } from '@/server/auth/page-guard'

// Student shell (contracts/ui-routes.md). Authoritative checks: signed-in student, and an active
// link before any app content (FR-004) — except Me, so they can still manage their account.
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  if (me.role !== 'student') redirect('/a/students')
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (!pathname.startsWith('/s/me') && !(await hasActiveLink(me.id))) redirect('/join')

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28">{children}</main>
      <StudentNav />
      <ThemeSync mode={me.colorMode} />
    </>
  )
}
