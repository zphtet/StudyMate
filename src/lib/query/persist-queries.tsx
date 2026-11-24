'use client'

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useMemo, type ReactNode } from 'react'
import { createDexiePersister } from '@/lib/offline/persister'
import { getBrowserQueryClient } from './client'

// Spec 008 FR-004; research R4: the signed-in user's queries are saved on the device and restored
// before the first fetch, so screens show the last data at once and work offline. Rendered by the
// /s and /a layouts, which know the user; the root QueryProvider can't (Cache Components). It wraps
// the same browser client, so nothing else changes.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function PersistQueries({ userId, children }: { userId: string; children: ReactNode }) {
  const persister = useMemo(() => createDexiePersister(userId), [userId])
  return (
    <PersistQueryClientProvider
      client={getBrowserQueryClient()}
      persistOptions={{
        persister,
        maxAge: WEEK_MS,
        // A new deploy may change what a query returns: start fresh rather than misread old data.
        buster: process.env.NEXT_PUBLIC_BUILD_ID,
        dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === 'success' },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
