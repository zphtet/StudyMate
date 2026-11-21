import { z } from 'zod'
import { getAdminLesson } from '@/features/courses/lesson-repo'
import { handle } from '@/lib/http'
import { requireLessonOwner } from '@/server/auth/guards'

// GET /api/admin/lessons/[lessonId] (spec 002 contracts/route-handlers.md). Owner only; 404 when the
// lesson or its course is deleted.
export function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  return handle(async () => {
    const lessonId = z.uuid().parse((await params).lessonId)
    const { me } = await requireLessonOwner(lessonId)
    return getAdminLesson(me.id, lessonId)
  })
}
