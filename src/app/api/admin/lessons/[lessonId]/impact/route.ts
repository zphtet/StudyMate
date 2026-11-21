import { z } from 'zod'
import { getLessonImpact } from '@/features/courses/lesson-repo'
import { handle } from '@/lib/http'
import { requireLessonOwner } from '@/server/auth/guards'

// GET /api/admin/lessons/[lessonId]/impact (spec 002 contracts/route-handlers.md): assigned students
// and their work, for the delete-lesson sheet. Owner only.
export function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  return handle(async () => {
    const lessonId = z.uuid().parse((await params).lessonId)
    const { me } = await requireLessonOwner(lessonId)
    return getLessonImpact(me.id, lessonId)
  })
}
