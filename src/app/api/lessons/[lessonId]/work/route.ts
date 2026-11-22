import { z } from 'zod'
import { getLessonWork } from '@/features/progress/repo'
import { handle, NotFound } from '@/lib/http'
import { AuthError, requireLessonReader, requireRole } from '@/server/auth/guards'

// GET /api/lessons/[lessonId]/work (spec 004 contracts/route-handlers.md › Student): the caller's own
// progress, submission and Notes count on one lesson. Same 404 lesson_not_found / 403 lesson_locked
// as 002's lesson endpoint.
export function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  return handle(async () => {
    const me = await requireRole('student')
    const id = z.uuid().safeParse((await params).lessonId)
    if (!id.success) throw new NotFound('lesson_not_found')
    await requireLessonReader(id.data).catch((error: unknown) => {
      if (error instanceof AuthError && error.status === 404) throw new NotFound('lesson_not_found')
      throw error
    })
    return getLessonWork(me, id.data)
  })
}
