import { z } from 'zod'
import { getStudentCourse } from '@/features/courses/student-repo'
import { handle, NotFound } from '@/lib/http'
import { AuthError, requireCourseReader, requireRole } from '@/server/auth/guards'

// GET /api/courses/[courseId] (spec 002 contracts/route-handlers.md › Student): sections and visible
// lessons, each Open or Locked. 404 course_not_found when the student can't read the course.
export function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  return handle(async () => {
    const me = await requireRole('student')
    const id = z.uuid().safeParse((await params).courseId)
    if (!id.success) throw new NotFound('course_not_found')
    await requireCourseReader(id.data).catch((error: unknown) => {
      if (error instanceof AuthError && error.status === 404) throw new NotFound('course_not_found')
      throw error
    })
    return getStudentCourse(me, id.data)
  })
}
