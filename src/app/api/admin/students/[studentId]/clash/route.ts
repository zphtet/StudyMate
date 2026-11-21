import { z } from 'zod'
import { clashFor } from '@/features/assignments/plan-repo'
import { handle } from '@/lib/http'
import { requireAdminOf } from '@/server/auth/guards'

// GET /api/admin/students/[studentId]/clash?at=<ISO>&minutes=<n> (spec 003 contracts/route-handlers.md):
// the shift/sleep check while an admin picks a deadline time (research R7, clarification 2026-11-21).
const querySchema = z.object({
  at: z.iso.datetime({ offset: true }),
  // The lesson's estimated minutes; the suggestion always leaves at least 60 (FR-009).
  minutes: z.coerce.number().int().min(1).max(600).default(60),
})

export function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  return handle(async () => {
    const studentId = z.uuid().parse((await params).studentId)
    await requireAdminOf(studentId)
    const { at, minutes } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    return { clash: await clashFor(studentId, new Date(at), minutes) }
  })
}
