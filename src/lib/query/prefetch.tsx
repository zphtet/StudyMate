import 'server-only'
import { HydrationBoundary, dehydrate, type QueryKey } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { getQueryClient } from './server'

/**
 * Seeds the client cache with data already read on the server (repo → same shape as the Route
 * Handler), so the first paint has data and the client query keeps it fresh (research R12).
 */
export function Prefetched({
  entries,
  children,
}: {
  entries: [QueryKey, unknown][]
  children: ReactNode
}) {
  const client = getQueryClient()
  for (const [key, data] of entries) client.setQueryData(key, data)
  return <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>
}
