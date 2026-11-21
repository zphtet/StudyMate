import { listLinkedStudents } from '@/features/assignments/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/admin/students (spec 003 contracts/route-handlers.md): the caller's actively linked
// students by name, for the Plan chips.
export function GET() {
  return handle(async () => {
    const me = await requireRole('admin')
    return listLinkedStudents(me.id)
  })
}
