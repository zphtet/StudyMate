import { z } from 'zod'
import { getPlanWeek } from '@/features/assignments/plan-repo'
import { weekSchema } from '@/features/assignments/plan-selection'
import { handle } from '@/lib/http'
import { requireAdminOf } from '@/server/auth/guards'

// GET /api/admin/plan?studentId=<id>&week=<monday> (spec 003 contracts/route-handlers.md): one
// student's week of deadlines. `week` must be a Monday (400 invalid_input); missing = this week.
const querySchema = z.object({ studentId: z.uuid(), week: weekSchema.optional() })

export function GET(request: Request) {
  return handle(async () => {
    const { studentId, week } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    const me = await requireAdminOf(studentId)
    return getPlanWeek({ admin: me, studentId, week })
  })
}
