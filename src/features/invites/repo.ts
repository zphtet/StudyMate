import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { generateInviteCode } from './code'

// Invite codes (data-model.md AdminInvite; research R11). Callers MUST have run requireRole('admin');
// the admin id comes from the guard.

const ATTEMPTS = 5

/**
 * FR-003: the current code stops working at once and a new one becomes the only active code. One
 * transaction; a new code that happens to exist already is drawn again.
 */
export async function regenerateInviteCode(adminId: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.adminInvite.updateMany({
          where: { adminId, active: true },
          data: { active: false },
        })
        return tx.adminInvite.create({
          data: { adminId, code: generateInviteCode() },
          select: { code: true },
        })
      })
    } catch (error) {
      const isCodeTaken =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (!isCodeTaken || attempt === ATTEMPTS) throw error
    }
  }
}
