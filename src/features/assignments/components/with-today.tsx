import { Suspense, type ReactNode } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { todayQuery } from '../queries'
import { getToday } from '../student-repo'
import { TodayView } from './today-view'

// Server-side seed for the student Today screen (spec 003 US3): same data as GET /api/today, read
// with the caller's id and time zone (the /s layout already checked the role).

/** `top` and `bottom` are other features' cards (spec 004), passed through to TodayView. */
export function TodayScreen(slots: { top?: ReactNode; bottom?: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedToday {...slots} />
    </Suspense>
  )
}

async function SeedToday({ top, bottom }: { top?: ReactNode; bottom?: ReactNode }) {
  const me = await requirePageUser()
  const today = await getToday(me)
  return (
    <Prefetched entries={[[todayQuery.queryKey, today]]}>
      <TodayView name={me.displayName} top={top} bottom={bottom} />
    </Prefetched>
  )
}
