import 'server-only'
import { Suspense } from 'react'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { joinRequestsQuery } from '../queries'
import { listJoinRequests } from '../repo'
import { JoinRequestList } from './join-request-list'

/** The admin's pending requests, read on the server and handed to the live list. */
export function JoinRequests() {
  return (
    <Suspense fallback={null}>
      <Seed />
    </Suspense>
  )
}

async function Seed() {
  const me = await requirePageUser()
  const requests = await listJoinRequests(me.id)
  return (
    <Prefetched entries={[[joinRequestsQuery.queryKey, { requests }]]}>
      <JoinRequestList adminId={me.id} />
    </Prefetched>
  )
}
