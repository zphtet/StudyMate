import type { OpType, OutboxEntry } from './db'
import type { SyncResult } from './outbox'

// What happens on the device after an op syncs (spec 008 research R5). Each feature's offline.ts
// registers its op types, so the sync loop (sync.ts) stays free of feature code: it only knows op
// types as strings.

export type OpHandlers = {
  /** Runs before the op is sent, e.g. uploading a draft's photos first (R9). Throws to wait. */
  prepare?: (entry: OutboxEntry) => Promise<void>
  /** Applied or duplicate: refresh what the Server Action's onSettled would. */
  onApplied?: (
    entry: OutboxEntry,
    result: Extract<SyncResult, { status: 'applied' | 'duplicate' }>,
  ) => void
  /** Dropped: undo the optimistic change on screen (the server's version wins). */
  onDropped?: (entry: OutboxEntry) => void
}

const handlers = new Map<OpType, OpHandlers>()

export function registerOp(types: OpType[], opHandlers: OpHandlers) {
  for (const type of types) handlers.set(type, opHandlers)
}

export function handlersFor(type: OpType): OpHandlers {
  return handlers.get(type) ?? {}
}
