import { getSummary } from '@/features/progress/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/progress/summary (spec 004 contracts/route-handlers.md › Student; research.md R13): the
// streak, weekly goal and Continue cards on Today.
export function GET() {
  return handle(async () => getSummary(await requireRole('student')))
}
