'use client'

import { Dexie } from 'dexie'
import { getBrowserQueryClient } from '@/lib/query/client'
import { USER_CACHES } from './cache-names'
import { closeDb } from './db'
import { stopPersisting } from './persister'

export { pendingCount } from './outbox'

/**
 * Sign-out on this device (spec 008 FR-004a; research R11): the user's saved screens, queued changes,
 * kept photos and courses, and the per-user worker caches are deleted. Shared phones are common, and
 * pages and files are cached by URL, so they can't be kept per user. The app shell stays.
 */
export async function wipeOfflineData() {
  stopPersisting()
  getBrowserQueryClient().clear()
  closeDb()
  await Dexie.delete('studymate')
  if ('caches' in window) await Promise.all(USER_CACHES.map((name) => caches.delete(name)))
}
