import 'server-only'
import { z } from 'zod'
import { ActionFailure } from '@/lib/action'

// What every queued op shares, and how one op's outcome is reported (spec 008 contracts/sync-route.md;
// research R7). Each feature's sync-ops.ts builds on these; src/app/api/sync/route.ts runs them.

/** Fields on every op: the op id (idempotency key) and when the student acted. */
export const opFields = {
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
}

export type OpOutcome =
  | { status: 'applied'; version?: string; data?: unknown }
  | { status: 'duplicate'; version?: string }

export type OpResult =
  | ({ id: string } & OpOutcome)
  | { id: string; status: 'dropped'; code: string }
  | { id: string; status: 'retry' }

/**
 * Runs one op. An expected failure (`fail(code)`) drops it with that code; anything else is thrown
 * on, so the route can stop the batch and ask the device to retry.
 */
export async function runOp(id: string, apply: () => Promise<OpOutcome>): Promise<OpResult> {
  try {
    return { id, ...(await apply()) }
  } catch (error) {
    if (error instanceof ActionFailure) return { id, status: 'dropped', code: error.code }
    throw error
  }
}
