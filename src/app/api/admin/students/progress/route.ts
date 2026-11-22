import { getStudentCards } from '@/features/progress/admin-repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/admin/students/progress (spec 004 contracts/route-handlers.md › Admin): one progress card
// per actively linked student.
export function GET() {
  return handle(async () => {
    const me = await requireRole('admin')
    return getStudentCards(me)
  })
}
