import { z } from 'zod'
import { getAssignSheet } from '@/features/assignments/repo'
import { handle } from '@/lib/http'
import { requireCourseOwner } from '@/server/auth/guards'

// GET /api/admin/courses/[courseId]/assign (spec 003 contracts/route-handlers.md): data for the
// Assign sheet — the course and every actively linked student with their current assignment.
export function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  return handle(async () => {
    const courseId = z.uuid().parse((await params).courseId)
    const me = await requireCourseOwner(courseId)
    return getAssignSheet(me.id, courseId)
  })
}
