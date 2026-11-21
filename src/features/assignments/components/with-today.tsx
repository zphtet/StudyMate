import { Suspense } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { todayQuery } from '../queries'
import { getToday } from '../student-repo'
import { TodayView } from './today-view'

// Server-side seed for the student Today screen (spec 003 US3): same data as GET /api/today, read
// with the caller's id and time zone (the /s layout already checked the role).

export function TodayScreen() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedToday />
    </Suspense>
  )
}

async function SeedToday() {
  const me = await requirePageUser()
  const today = await getToday(me)
  return (
    <Prefetched entries={[[todayQuery.queryKey, today]]}>
      <TodayView name={me.displayName} />
    </Prefetched>
  )
}
