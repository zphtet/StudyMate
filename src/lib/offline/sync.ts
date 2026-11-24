'use client'

import { liveQuery } from 'dexie'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { OutboxEntry } from './db'
import {
  droppedEntries,
  markSyncing,
  nextBatch,
  pendingCount,
  recoverSyncing,
  resolve,
  sendFailed,
  type SyncResult,
} from './outbox'
import { getBrowserQueryClient } from '@/lib/query/client'
import { forgetQueuedFiles, uploadQueuedFiles } from './queued-files'

// The sync loop (spec 008 research R5, R9, R10): sends the signed-in student's outbox to /api/sync in
// order, whenever the app is open and online. Network failures back off from 5 s to 60 s; a 401
// pauses until the student signs in again and never deletes anything.

const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 60_000
const POLL_MS = 60_000

type Status = { isSyncing: boolean; isPaused: boolean }
let status: Status = { isSyncing: false, isPaused: false }
const listeners = new Set<() => void>()
function setStatus(next: Partial<Status>) {
  status = { ...status, ...next }
  listeners.forEach((listener) => listener())
}

let activeUserId: string | null = null
let inFlight: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined
let failures = 0

/** What /api/sync receives for one entry (contracts/sync-route.md). */
const toWire = (entry: OutboxEntry) => ({
  ...entry.payload,
  id: entry.id,
  type: entry.type,
  at: entry.at,
  base: entry.base,
})

function scheduleRetry() {
  clearTimeout(retryTimer)
  const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** failures)
  failures += 1
  retryTimer = setTimeout(() => void syncNow(), delay)
}

class SyncStopped extends Error {}

/**
 * After a batch, every screen refetches what the server now holds: what each Server Action's
 * onSettled would invalidate, and the server's version where a change was dropped (R7).
 */
function refreshScreens() {
  return getBrowserQueryClient().invalidateQueries()
}

/** Sends one batch; returns false when there was nothing to send. Throws SyncStopped to wait. */
async function sendBatch(userId: string): Promise<boolean> {
  const batch = await nextBatch(userId)
  if (batch.length === 0) return false
  const ids = batch.map((entry) => entry.id)
  try {
    for (const entry of batch) await uploadQueuedFiles(entry)
  } catch {
    await sendFailed(ids)
    throw new SyncStopped()
  }

  await markSyncing(ids)
  let response: Response
  try {
    response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: batch.map(toWire) }),
    })
  } catch {
    await sendFailed(ids)
    throw new SyncStopped()
  }

  if (response.status === 401) {
    await resolve(batch, []) // back to pending, untouched (R10)
    setStatus({ isPaused: true })
    throw new SyncStopped()
  }
  if (response.status === 400) {
    // The server can't read these ops at all (e.g. written by an older version): report them
    // instead of retrying forever.
    await resolve(
      batch,
      ids.map((id) => ({ id, status: 'dropped', code: 'invalid_input' })),
    )
    await refreshScreens()
    return true
  }
  if (!response.ok) {
    await sendFailed(ids)
    throw new SyncStopped()
  }

  const { results } = (await response.json()) as { results: SyncResult[] }
  await resolve(batch, results)
  const saved = new Set(
    results.flatMap((r) => (r.status === 'applied' || r.status === 'duplicate' ? [r.id] : [])),
  )
  await Promise.all(batch.filter((e) => saved.has(e.id)).map(forgetQueuedFiles))
  await refreshScreens()
  if (results.some((result) => result.status === 'retry')) throw new SyncStopped()
  return true
}

/** Sends everything pending now, one request at a time. Safe to call often. */
export function syncNow(): Promise<void> {
  const userId = activeUserId
  if (!userId || typeof navigator === 'undefined' || !navigator.onLine) {
    return Promise.resolve()
  }
  inFlight ??= (async () => {
    setStatus({ isSyncing: true, isPaused: false })
    try {
      while (await sendBatch(userId)) {
        // keep going until the outbox is empty
      }
      failures = 0
    } catch (error) {
      if (!(error instanceof SyncStopped)) throw error
      if (!status.isPaused) scheduleRetry()
    } finally {
      inFlight = null
      setStatus({ isSyncing: false })
    }
  })()
  return inFlight
}

/** Starts syncing for the signed-in student; returns the stop function. */
export function startSync(userId: string) {
  activeUserId = userId
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  const onOnline = () => void syncNow()
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const poll = setInterval(async () => {
    if ((await pendingCount(userId)) > 0) void syncNow()
  }, POLL_MS)
  void recoverSyncing().then(() => syncNow())
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(poll)
    clearTimeout(retryTimer)
    if (activeUserId === userId) activeUserId = null
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const serverStatus: Status = { isSyncing: false, isPaused: false }

/** The outbox for the banner, the "Not saved" sheet and sign-out (contracts/ui-routes.md). */
export function useOutboxState(userId: string) {
  const { isSyncing, isPaused } = useSyncExternalStore(
    subscribe,
    () => status,
    () => serverStatus,
  )
  const [counts, setCounts] = useState<{ pending: number; dropped: OutboxEntry[] }>({
    pending: 0,
    dropped: [],
  })
  useEffect(() => {
    const subscription = liveQuery(async () => ({
      pending: await pendingCount(userId),
      dropped: await droppedEntries(userId),
    })).subscribe({ next: setCounts })
    return () => subscription.unsubscribe()
  }, [userId])
  return { ...counts, isSyncing, isPaused }
}
