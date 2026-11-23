import { z } from 'zod'
import { getShift } from '@/features/shifts/repo'
import { handle, NotFound } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/shifts/[shiftId] (spec 005 contracts/route-handlers.md): one of the student's shifts for
// the editor; 404 shift_not_found when it isn't theirs.
export function GET(_request: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  return handle(async () => {
    const me = await requireRole('student')
    const shiftId = z.uuid().safeParse((await params).shiftId)
    if (!shiftId.success) throw new NotFound('shift_not_found')
    return getShift(me, shiftId.data)
  })
}
