import { listAdminCourses } from '@/features/courses/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/admin/courses (spec 002 contracts/route-handlers.md). The caller's own courses only.
export function GET() {
  return handle(async () => listAdminCourses((await requireRole('admin')).id))
}
