import { z } from 'zod'
import { getPlanMonth } from '@/features/assignments/plan-repo'
import { monthSchema } from '@/features/assignments/schemas'
import { handle } from '@/lib/http'
import { requireAdminOf } from '@/server/auth/guards'

// GET /api/admin/plan/month?studentId=<id>&month=<YYYY-MM> (spec 003 contracts/route-handlers.md):
// deadline counts per day of one student's month. Missing month = this month in the student's zone.
const querySchema = z.object({ studentId: z.uuid(), month: monthSchema.optional() })

export function GET(request: Request) {
  return handle(async () => {
    const { studentId, month } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    const me = await requireAdminOf(studentId)
    return getPlanMonth({ admin: me, studentId, month: month ?? null })
  })
}
