import type { ReactNode } from 'react'
import { AdminNav } from '@/components/layout/admin-nav'

export default function AdminTabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28">{children}</main>
      <AdminNav />
    </>
  )
}
