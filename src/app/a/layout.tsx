import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ThemeSync } from '@/components/shared/theme-sync'
import { requirePageUser } from '@/server/auth/page-guard'

// Admin area: authoritative role check (the proxy's check is only optimistic).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  if (me.role !== 'admin') redirect('/s/today')
  return (
    <>
      {children}
      <ThemeSync mode={me.colorMode} />
    </>
  )
}
