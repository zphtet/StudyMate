import { getShiftSettings } from '@/features/shifts/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/shifts/settings (spec 005 contracts/route-handlers.md; research R3, R10): preset times,
// sleep length, waking hours and the active rotation.
export function GET() {
  return handle(async () => getShiftSettings(await requireRole('student')))
}
