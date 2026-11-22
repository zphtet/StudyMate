import { getActiveSession } from '@/features/progress/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/focus (spec 004 contracts/route-handlers.md; research.md R3): the student's running focus
// session, if still within its plan, and the server's clock for the countdown.
export function GET() {
  return handle(async () => getActiveSession(await requireRole('student')))
}
