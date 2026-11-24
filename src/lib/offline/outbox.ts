import { db, type OpBase, type OpType, type OutboxEntry } from './db'

// The outbox: changes made offline, waiting for /api/sync (spec 008 research R5; data-model.md
// outbox.*, › State transitions and Coalescing). One pending entry per record, so autosave never
// piles up entries and "Will sync" is one lookup. A change only merges into an entry that was never
// sent: one that was sent may already be applied under its op id, and merging into it would hide the
// new content behind a "duplicate".

/** /api/sync takes at most this many ops per request (contracts/sync-route.md). */
export const BATCH_SIZE = 50

export type EnqueueInput = {
  userId: string
  type: OpType
  recordKey: string
  payload: Record<string, unknown>
  base: OpBase
  /** When the student acted; defaults to now. */
  at?: string
  label: string
}

/** What /api/sync answered for one op (src/lib/offline/server-op.ts OpResult). */
export type SyncResult =
  | { id: string; status: 'applied' | 'duplicate'; version?: string; data?: unknown }
  | { id: string; status: 'dropped'; code: string }
  | { id: string; status: 'retry' }

let lastStamp = 0
/** Strictly increasing, so two changes in the same millisecond keep their order. */
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1))

const cancels = (earlier: OpType, later: OpType) =>
  (earlier === 'progress.complete' && later === 'progress.undo') ||
  (earlier === 'progress.undo' && later === 'progress.complete')

/** Adds a change, or merges it into the record's unsent entry. Null when the two cancel out. */
export async function enqueue(input: EnqueueInput): Promise<OutboxEntry | null> {
  const at = input.at ?? new Date().toISOString()
  const outbox = db().outbox
  return db().transaction('rw', outbox, async () => {
    const unsent = await outbox
      .where('[userId+recordKey]')
      .equals([input.userId, input.recordKey])
      .filter((e) => e.state === 'pending' && e.attempts === 0)
      .first()

    if (!unsent) {
      const entry: OutboxEntry = {
        id: crypto.randomUUID(),
        userId: input.userId,
        type: input.type,
        recordKey: input.recordKey,
        payload: input.payload,
        base: input.base,
        at,
        createdAt: stamp(),
        state: 'pending',
        attempts: 0,
        error: null,
        label: input.label,
      }
      await outbox.add(entry)
      return entry
    }

    const isNewShift = unsent.type === 'shift.save' && unsent.base === null
    if (cancels(unsent.type, input.type) || (isNewShift && input.type === 'shift.delete')) {
      await outbox.delete(unsent.id)
      return null
    }
    // The base and first time stay: the server compares with what the student saw first. A Submit
    // keeps its own press time (FR-003c).
    const merged: OutboxEntry = {
      ...unsent,
      type: input.type,
      payload: input.payload,
      at: input.type === 'submission.submit' ? at : unsent.at,
      label: input.label,
    }
    await outbox.put(merged)
    return merged
  })
}

/** The user's next entries to send, oldest first. */
export function nextBatch(userId: string) {
  return db()
    .outbox.where('[userId+state]')
    .equals([userId, 'pending'])
    .sortBy('createdAt')
    .then((entries) => entries.slice(0, BATCH_SIZE))
}

export async function markSyncing(ids: string[]) {
  await db().outbox.where('id').anyOf(ids).modify({ state: 'syncing' })
}

/** The request never got an answer: back to pending, one attempt more. */
export async function sendFailed(ids: string[]) {
  await db()
    .outbox.where('id')
    .anyOf(ids)
    .modify((entry) => {
      entry.state = 'pending'
      entry.attempts += 1
    })
}

/**
 * Applies /api/sync's answer to the entries that were sent. Applied and duplicate entries are
 * removed, and later entries for the same record take the new version as their base. Dropped ones
 * stay with their reason for the "Not saved" sheet. A retry, and anything after it the server didn't
 * reach, go back to pending.
 */
export async function resolve(sent: OutboxEntry[], results: SyncResult[]) {
  const outbox = db().outbox
  const byId = new Map(results.map((result) => [result.id, result]))
  await db().transaction('rw', outbox, async () => {
    for (const entry of sent) {
      const result = byId.get(entry.id)
      if (!result) {
        await outbox.update(entry.id, { state: 'pending' })
      } else if (result.status === 'retry') {
        await outbox.update(entry.id, { state: 'pending', attempts: entry.attempts + 1 })
      } else if (result.status === 'dropped') {
        await outbox.update(entry.id, { state: 'dropped', error: result.code })
      } else {
        await outbox.delete(entry.id)
        const { version } = result
        if (version) await rebase(entry, version)
      }
    }
  })
}

/** Research R5: later entries for the record were made on what this one just wrote. */
async function rebase(applied: OutboxEntry, version: string) {
  await db()
    .outbox.where('[userId+recordKey]')
    .equals([applied.userId, applied.recordKey])
    .filter((e) => e.state === 'pending' && e.base !== null && 'updatedAt' in e.base)
    .modify({ base: { updatedAt: version } })
}

/** Entries left `syncing` when the app closed mid-request are sent again; nothing else changes. */
export async function recoverSyncing() {
  await db()
    .outbox.filter((e) => e.state === 'syncing')
    .modify({ state: 'pending' })
}

/** Changes still to send (pending or in flight): the banner's count and sign-out's warning. */
export async function pendingCount(userId: string) {
  const outbox = db().outbox
  const [pending, syncing] = await Promise.all([
    outbox.where('[userId+state]').equals([userId, 'pending']).count(),
    outbox.where('[userId+state]').equals([userId, 'syncing']).count(),
  ])
  return pending + syncing
}

export function droppedEntries(userId: string) {
  return db().outbox.where('[userId+state]').equals([userId, 'dropped']).sortBy('createdAt')
}

export async function dismissDropped(ids: string[]) {
  await db().outbox.bulkDelete(ids)
}
