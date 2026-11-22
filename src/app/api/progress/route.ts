import { z } from 'zod'
import { getProgress } from '@/features/progress/repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/progress?view=month|week (spec 004 contracts/route-handlers.md › Student; research.md
// R5): the student's own Progress screen, and the Courses tab's "Studied this week" card.
const viewSchema = z.enum(['month', 'week']).catch('month')

export function GET(request: Request) {
  return handle(async () => {
    const me = await requireRole('student')
    const view = viewSchema.parse(new URL(request.url).searchParams.get('view'))
    return getProgress(me, view)
  })
}
