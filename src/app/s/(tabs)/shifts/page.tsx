import { Suspense } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { ShiftsView } from '@/features/shifts/components/shifts-view'
import { SeedShiftsMonth } from '@/features/shifts/components/with-shifts'

// Student Shifts (screen 07-Shifts; spec 005 US1). `?month=YYYY-MM` (default this month in the
// student's zone) and `?day=YYYY-MM-DD` (the selected day, changed without a request).
type SearchParams = Promise<{ month?: string | string[] }>

export default function ShiftsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Shifts searchParams={searchParams} />
    </Suspense>
  )
}

async function Shifts({ searchParams }: { searchParams: SearchParams }) {
  const { month } = await searchParams
  return (
    <SeedShiftsMonth month={typeof month === 'string' ? month : undefined}>
      {(month) => <ShiftsView month={month} />}
    </SeedShiftsMonth>
  )
}
