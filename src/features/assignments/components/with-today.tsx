import { Suspense, type ReactNode } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { todayQuery } from '../queries'
import { getToday } from '../student-repo'
import { TodayView } from './today-view'

// Server-side seed for the student Today screen (spec 003 US3): same data as GET /api/today, read
// with the caller's id and time zone (the /s layout already checked the role).

type Slots = { actions?: ReactNode; top?: ReactNode; bottom?: ReactNode }

/** `actions`, `top` and `bottom` are other features' parts (004, 005, 006), passed to TodayView. */
export function TodayScreen(slots: Slots) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedToday {...slots} />
    </Suspense>
  )
}

async function SeedToday({ actions, top, bottom }: Slots) {
  const me = await requirePageUser()
  const today = await getToday(me)
  return (
    <Prefetched entries={[[todayQuery.queryKey, today]]}>
      <TodayView name={me.displayName} actions={actions} top={top} bottom={bottom} />
    </Prefetched>
  )
}
