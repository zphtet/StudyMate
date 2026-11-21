import type { ReactNode } from 'react'
import { StudentNav } from '@/components/layout/student-nav'

// Student tab pages (Today, Courses, Progress, Shifts, Me) with the bottom nav. Course and lesson
// screens live outside this group so they render full screen (spec 002 contracts/ui-routes.md).
export default function StudentTabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28">{children}</main>
      <StudentNav />
    </>
  )
}
