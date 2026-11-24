import 'server-only'
import { z } from 'zod'
import { fail } from '@/lib/action'
import { opFields, runOp, type OpResult } from '@/lib/offline/server-op'
import { deleteShift, saveShift, shiftCreatedBy, shiftVersion } from './repo'
import { deleteShiftSchema, saveShiftSchema } from './schemas'

// The shift ops a device queues offline and /api/sync replays (spec 008 contracts/sync-route.md;
// research R7): one shift added, edited or deleted. Rotations aren't queued (clarification Q5).
// The form's fields sit under `shift`, since the form has its own `type` (day, night, …). The caller
// has already run requireRole('student'); every query is scoped to `me.id`.

type Student = { id: string; timezone: string; sleepMinutes: number }

const version = z.object({ updatedAt: z.iso.datetime({ offset: true }) })

export const shiftOpSchemas = [
  z.object({
    ...opFields,
    type: z.literal('shift.save'),
    shift: saveShiftSchema,
    /** null for a new shift. */
    base: version.nullable(),
  }),
  deleteShiftSchema.extend({ ...opFields, type: z.literal('shift.delete'), base: version }),
] as const

export type ShiftOp = z.infer<(typeof shiftOpSchemas)[number]>

export function applyShiftOp(me: Student, op: ShiftOp): Promise<OpResult> {
  return runOp(op.id, async () => {
    const baseUpdatedAt = op.base && new Date(op.base.updatedAt)
    const replayed = { opId: op.id, baseUpdatedAt }

    if (op.type === 'shift.save') {
      const { shiftId } = op.shift
      if (shiftId === undefined) {
        const created = await shiftCreatedBy(me.id, op.id)
        if (created) return { status: 'duplicate', version: created.updatedAt }
      } else {
        if (baseUpdatedAt === null) fail('invalid_input')
        const stored = await shiftVersion(me.id, shiftId)
        if (stored?.clientOpId === op.id) {
          return { status: 'duplicate', version: stored.updatedAt.toISOString() }
        }
      }
      const data = await saveShift(me, op.shift, replayed)
      return { status: 'applied', version: data.shift.updatedAt, data }
    }

    // A shift already gone was deleted by this op, or another change got there first: either way
    // the student's intent holds, so it isn't reported.
    const stored = await shiftVersion(me.id, op.shiftId)
    if (!stored || stored.clientOpId === op.id) return { status: 'duplicate' }
    return { status: 'applied', data: await deleteShift(me, op.shiftId, replayed) }
  })
}
