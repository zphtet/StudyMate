import { getOverview } from '@/features/admin/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/admin/overview (contracts/route-handlers.md): feeds the Welcome checklist.
export function GET() {
  return handle(async () => {
    const me = await requireRole('admin')
    return getOverview(me.id)
  })
}
