import 'server-only'
import { prisma } from '@/lib/prisma'

// Link rules live here (research R2). Callers MUST have run a guard; ids come from the guard.

/** FR-004: a student sees app content only with an active link. */
export async function hasActiveLink(studentId: string) {
  const link = await prisma.studentLink.findFirst({
    where: { studentId, status: 'active' },
    select: { id: true },
  })
  return link !== null
}
