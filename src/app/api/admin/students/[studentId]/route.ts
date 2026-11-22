import { z } from 'zod'
import { getStudentDetail } from '@/features/progress/admin-repo'
import { handle, NotFound } from '@/lib/http'
import { requireAdminOf } from '@/server/auth/guards'

// GET /api/admin/students/[studentId] (spec 004 contracts/route-handlers.md › Admin): one linked
// student's courses and lessons with their done flags.
export function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  return handle(async () => {
    const id = z.uuid().safeParse((await params).studentId)
    if (!id.success) throw new NotFound('student_not_found')
    const me = await requireAdminOf(id.data)
    return getStudentDetail(me, id.data)
  })
}
