import { z } from 'zod'
import { getAdminLesson } from '@/features/progress/admin-repo'
import { handle, NotFound } from '@/lib/http'
import { requireAdminLessonTarget } from '@/server/auth/guards'

// GET /api/admin/students/[studentId]/lessons/[lessonId] (spec 004 contracts/route-handlers.md ›
// Admin): the review screen for one student's lesson.
const paramsSchema = z.object({ studentId: z.uuid(), lessonId: z.uuid() })

export function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string; lessonId: string }> },
) {
  return handle(async () => {
    const parsed = paramsSchema.safeParse(await params)
    if (!parsed.success) throw new NotFound('lesson_not_found')
    const { studentId, lessonId } = parsed.data
    const { me } = await requireAdminLessonTarget(lessonId, studentId)
    return getAdminLesson(me, studentId, lessonId)
  })
}
