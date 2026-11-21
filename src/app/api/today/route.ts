import { getToday } from '@/features/assignments/student-repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/today (spec 003 contracts/route-handlers.md › Student): the caller's overdue lessons and
// lessons due later today, judged in their own time zone.
export function GET() {
  return handle(async () => {
    const me = await requireRole('student')
    return getToday(me)
  })
}
