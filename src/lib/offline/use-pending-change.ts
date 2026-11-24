'use client'

import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type OutboxEntry } from './db'

/**
 * The change still waiting to sync for one record (spec 008 contracts/ui-routes.md › SyncPill), or
 * null. Only the signed-in user's rows are on the device (research R10), so the record key is enough.
 */
export function usePendingChange(recordKey: string): OutboxEntry | null {
  const [entry, setEntry] = useState<OutboxEntry | null>(null)
  useEffect(() => {
    const subscription = liveQuery(() =>
      db()
        .outbox.filter((e) => e.recordKey === recordKey && e.state !== 'dropped')
        .last(),
    ).subscribe({ next: (found) => setEntry(found ?? null) })
    return () => subscription.unsubscribe()
  }, [recordKey])
  return entry
}
