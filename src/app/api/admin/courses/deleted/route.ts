import { listRecentlyDeleted } from '@/features/courses/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/admin/courses/deleted (spec 002 contracts/route-handlers.md): the caller's courses and
// lessons deleted in the last 30 days.
export function GET() {
  return handle(async () => {
    const me = await requireRole('admin')
    return listRecentlyDeleted(me.id)
  })
}
