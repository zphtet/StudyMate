import { getAlertsData } from '@/features/alerts/repo'
import { alertsStudentSchema } from '@/features/alerts/schemas'
import { handle } from '@/lib/http'
import { requireAdminOf, requireRole } from '@/server/auth/guards'

// GET /api/alerts?student=<id|all> (spec 006 contracts/route-handlers.md › Admin): the chips, the
// scheduled and this week's messages, and the rules, for one linked student or for all of them.
export function GET(request: Request) {
  return handle(async () => {
    const admin = await requireRole('admin')
    const student = alertsStudentSchema.parse(
      new URL(request.url).searchParams.get('student') ?? 'all',
    )
    const me = student === 'all' ? admin : await requireAdminOf(student)
    return getAlertsData(me, student === 'all' ? null : student, new Date())
  })
}
