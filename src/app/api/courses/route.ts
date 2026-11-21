import { listStudentCourses } from '@/features/courses/student-repo'
import { handle } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/courses (spec 002 contracts/route-handlers.md › Student): courses assigned to the caller.
export function GET() {
  return handle(async () => {
    const me = await requireRole('student')
    return listStudentCourses(me.id)
  })
}
