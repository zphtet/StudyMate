import 'server-only'
import { cache, Suspense, type ReactNode } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { progressQuery, summaryQuery } from '../queries'
import { getProgress, getSummary } from '../repo'
import type { ProgressView } from '../types'

// Server-side seeds for the student's progress (spec 004 US3): the same data and guard as GET
// /api/progress and /api/progress/summary, read with the caller's id and zone (the /s layout already
// checked the role).

export function WithProgress({
  view,
  card = false,
  children,
}: {
  view: ProgressView
  /** A card inside another screen (Courses) instead of the whole Progress screen. */
  card?: boolean
  children: ReactNode
}) {
  return (
    <Suspense
      fallback={card ? <Skeleton className="h-48 rounded-3xl" /> : <PageSkeleton header={false} />}
    >
      <SeedProgress view={view}>{children}</SeedProgress>
    </Suspense>
  )
}

async function SeedProgress({ view, children }: { view: ProgressView; children: ReactNode }) {
  const me = await requirePageUser()
  const progress = await getProgress(me, view)
  return <Prefetched entries={[[progressQuery(view).queryKey, progress]]}>{children}</Prefetched>
}

export function WithSummary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-36 rounded-3xl" />}>
      <SeedSummary>{children}</SeedSummary>
    </Suspense>
  )
}

/** Today seeds the summary in two places (cards on top, Continue below): one read per request. */
const summaryOf = cache(async () => getSummary(await requirePageUser()))

async function SeedSummary({ children }: { children: ReactNode }) {
  const summary = await summaryOf()
  return <Prefetched entries={[[summaryQuery.queryKey, summary]]}>{children}</Prefetched>
}
