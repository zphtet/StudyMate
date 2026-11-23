import { getMonthShifts } from '@/features/shifts/repo'
import { monthSchema } from '@/features/shifts/schemas'
import { handle } from '@/lib/http'
import { todayIn } from '@/lib/time'
import { requireRole } from '@/server/auth/guards'

// GET /api/shifts?month=YYYY-MM (spec 005 contracts/route-handlers.md; research R6): the student's
// shifts of the month ±1 day and the merged busy segments. A missing or invalid month is the
// student's current local month.
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireRole('student')
    const month = monthSchema
      .catch(todayIn(me.timezone).slice(0, 7))
      .parse(new URL(request.url).searchParams.get('month') ?? undefined)
    return getMonthShifts(me, month)
  })
}
