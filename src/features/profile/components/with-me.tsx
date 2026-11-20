import { Suspense, type ReactNode } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { meQuery } from '../queries'
import { getMe } from '../repo'

/** Reads the signed-in user's /api/me data on the server and seeds the client cache. */
export function WithMe({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton header={false} />}>
      <Seed>{children}</Seed>
    </Suspense>
  )
}

async function Seed({ children }: { children: ReactNode }) {
  const me = await getMe(await requirePageUser())
  return <Prefetched entries={[[meQuery.queryKey, me]]}>{children}</Prefetched>
}
