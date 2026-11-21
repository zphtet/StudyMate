import { z } from 'zod'
import { getAdminCourse } from '@/features/courses/repo'
import { handle } from '@/lib/http'
import { requireCourseOwner } from '@/server/auth/guards'

// GET /api/admin/courses/[courseId] (spec 002 contracts/route-handlers.md). Owner only; 404 if deleted.
export function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  return handle(async () => {
    const courseId = z.uuid().parse((await params).courseId)
    const me = await requireCourseOwner(courseId)
    return getAdminCourse(me.id, courseId)
  })
}
