import { listJoinRequests } from '@/features/links/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/admin/students/requests: the caller's pending join requests, newest first (spec 001
// contracts/route-handlers.md › GET /api/admin/students `requests`; spec 003 took that path for the
// linked students list).
export function GET() {
  return handle(async () => {
    const me = await requireRole('admin')
    return { requests: await listJoinRequests(me.id) }
  })
}
