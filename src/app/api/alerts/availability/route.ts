import { availability } from '@/features/alerts/messages-repo'
import { availabilityQuerySchema } from '@/features/alerts/schemas'
import { handle } from '@/lib/http'
import { requireAdminOfAll, requireRole } from '@/server/auth/guards'

// GET /api/alerts/availability?students=<id,id>&at=<ISO> (spec 006 contracts/route-handlers.md ›
// Admin; US3 scenario 4): is that moment free for each linked student, and their next free moment.
export function GET(request: Request) {
  return handle(async () => {
    await requireRole('admin')
    const { searchParams } = new URL(request.url)
    const { students, at } = availabilityQuerySchema.parse({
      students: searchParams.get('students'),
      at: searchParams.get('at'),
    })
    await requireAdminOfAll(students)
    return availability(students, new Date(at))
  })
}
