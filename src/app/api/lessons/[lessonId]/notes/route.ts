import { z } from 'zod'
import { getNotes } from '@/features/progress/repo'
import { handle, NotFound } from '@/lib/http'
import {
  AuthError,
  requireAdminLessonTarget,
  requireLessonReader,
  requireUser,
} from '@/server/auth/guards'

// GET /api/lessons/[lessonId]/notes?studentId=<id> (spec 004 contracts/route-handlers.md › Student):
// one Notes thread, oldest first, at most 200. Students read their own thread (studentId absent or
// their own id); Admins name the student and need requireAdminLessonTarget.
export function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  return handle(async () => {
    const me = await requireUser()
    const lessonId = z.uuid().safeParse((await params).lessonId)
    if (!lessonId.success) throw new NotFound('lesson_not_found')
    const raw = new URL(request.url).searchParams.get('studentId')
    const studentId = raw === null ? null : z.uuid().parse(raw)

    if (me.role === 'admin') {
      if (!studentId) throw new NotFound('student_not_found')
      await requireAdminLessonTarget(lessonId.data, studentId)
      return getNotes(me, lessonId.data, studentId)
    }
    if (studentId && studentId !== me.id) throw new AuthError(403, 'Not your thread')
    await requireLessonReader(lessonId.data).catch((error: unknown) => {
      if (error instanceof AuthError && error.status === 404) throw new NotFound('lesson_not_found')
      throw error
    })
    return getNotes(me, lessonId.data, me.id)
  })
}
