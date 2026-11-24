import { z } from 'zod'
import { applyProgressOp, progressOpSchemas } from '@/features/progress/sync-ops'
import { applyShiftOp, shiftOpSchemas, type ShiftOp } from '@/features/shifts/sync-ops'
import { handle } from '@/lib/http'
import type { OpResult } from '@/lib/offline/server-op'
import { AuthError, requireRole } from '@/server/auth/guards'

// POST /api/sync (spec 008 contracts/sync-route.md; research R6): the device's outbox replays here, in
// order. A plain URL survives deploys, unlike Server Action ids (constitution VII 2.1.0). Each op runs
// its feature's guard and repo function; one that is dropped doesn't stop the rest, and an unexpected
// error stops the batch so the device retries from that op.

const opSchema = z.discriminatedUnion('type', [...progressOpSchemas, ...shiftOpSchemas])
const bodySchema = z.object({ ops: z.array(opSchema).min(1).max(50) })

type Op = z.infer<typeof opSchema>
const isShiftOp = (op: Op): op is ShiftOp => op.type === 'shift.save' || op.type === 'shift.delete'

export function POST(request: Request) {
  return handle(async () => {
    const me = await requireRole('student')
    const { ops } = bodySchema.parse(await request.json().catch(() => null))
    const serverNow = new Date()
    const results: OpResult[] = []
    for (const op of ops) {
      try {
        results.push(
          isShiftOp(op) ? await applyShiftOp(me, op) : await applyProgressOp(me, op, serverNow),
        )
      } catch (error) {
        if (error instanceof AuthError && error.status === 401) throw error
        console.error('[sync] op failed, asking the device to retry', op.type, error)
        results.push({ id: op.id, status: 'retry' })
        break
      }
    }
    return { results }
  })
}
