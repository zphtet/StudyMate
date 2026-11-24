import type { Persister } from '@tanstack/react-query-persist-client'
import { db } from './db'

// The TanStack Query persister over Dexie (spec 008 FR-004; research R4; data-model.md
// queryCache.client): screens render from the saved copy at once, and refetch when online. One row
// per user, so another user's data is never restored; sign-out deletes the database (R11).
/** Set while signing out, so a throttled save can't write the user's data back (R11). */
let isStopped = false
export function stopPersisting() {
  isStopped = true
}

export function createDexiePersister(userId: string): Persister {
  return {
    persistClient: async (client) => {
      if (isStopped) return
      await db().queryCache.put({ userId, client })
    },
    restoreClient: async () => (await db().queryCache.get(userId))?.client,
    removeClient: async () => {
      await db().queryCache.delete(userId)
    },
  }
}
