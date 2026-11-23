import { getShiftsToday } from '@/features/shifts/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/shifts/today (spec 005 contracts/route-handlers.md; research R7, R9, R10): the Today
// shift banner, the Me row's count, the Sunday check and whether the student has any shift.
export function GET() {
  return handle(async () => getShiftsToday(await requireRole('student')))
}
