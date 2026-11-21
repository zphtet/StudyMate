import { z } from 'zod'
import { listStudentCoursesForAdmin } from '@/features/assignments/repo'
import { handle } from '@/lib/http'
import { requireAdminOf } from '@/server/auth/guards'

// GET /api/admin/students/[studentId]/courses (spec 003 contracts/route-handlers.md): the caller's
// Active courses assigned to the student, with Published lessons, for the "+ Deadline" sheet.
export function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  return handle(async () => {
    const studentId = z.uuid().parse((await params).studentId)
    const me = await requireAdminOf(studentId)
    return listStudentCoursesForAdmin(me.id, studentId)
  })
}
