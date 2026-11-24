import type { Persister } from '@tanstack/react-query-persist-client'
import { db } from './db'

// The TanStack Query persister over Dexie (spec 008 FR-004; research R4; data-model.md
// queryCache.client): screens render from the saved copy at once, and refetch when online. One row
// per user, so another user's data is never restored; sign-out deletes the database (R11).
export function createDexiePersister(userId: string): Persister {
  return {
    persistClient: async (client) => {
      await db().queryCache.put({ userId, client })
    },
    restoreClient: async () => (await db().queryCache.get(userId))?.client,
    removeClient: async () => {
      await db().queryCache.delete(userId)
    },
  }
}
