import { QueryClient, defaultShouldDehydrateQuery, isServer } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

// One configuration for server prefetching and the browser (technical spec §8).
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Kept as long as the persisted copy (spec 008 research R4), so restored data isn't collected.
        gcTime: 7 * 24 * 60 * 60 * 1000,
        // Don't retry answers that won't change (401/403/404/400).
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  })
}

let browserClient: QueryClient | undefined

/** Browser: one client for the app's lifetime. Server: a new one (see server.ts for per-request). */
export function getBrowserQueryClient() {
  if (isServer) return makeQueryClient()
  browserClient ??= makeQueryClient()
  return browserClient
}
