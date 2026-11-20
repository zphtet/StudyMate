import 'server-only'
import { prisma } from '@/lib/prisma'
import type { LimitPurpose, LimitRow } from './limits'

// Storage for the email-code limits (data-model.md › AuthEmailLimit). Server-only table: RLS on,
// no policies, no browser privileges. Used only by the public auth actions (plan.md, Complexity Tracking).

const STALE_MS = 24 * 60 * 60 * 1000

export const normaliseEmail = (email: string) => email.trim().toLowerCase()

const key = (email: string, purpose: LimitPurpose) => ({
  email_purpose: { email: normaliseEmail(email), purpose },
})

export async function getLimit(email: string, purpose: LimitPurpose): Promise<LimitRow | null> {
  const row = await prisma.authEmailLimit.findUnique({ where: key(email, purpose) })
  if (!row) return null
  // A row untouched for 24 h no longer matters (research R3): treat it as absent.
  if (Date.now() - row.updatedAt.getTime() > STALE_MS) return null
  return {
    windowStartedAt: row.windowStartedAt,
    sendsInWindow: row.sendsInWindow,
    lastSentAt: row.lastSentAt,
    failedAttempts: row.failedAttempts,
  }
}

export async function saveLimit(email: string, purpose: LimitPurpose, next: LimitRow) {
  const normalised = normaliseEmail(email)
  await prisma.$transaction([
    // Privacy: drop this email's stale rows whenever it is written again.
    prisma.authEmailLimit.deleteMany({
      where: { email: normalised, updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    }),
    prisma.authEmailLimit.upsert({
      where: key(email, purpose),
      create: { email: normalised, purpose, ...next },
      update: next,
    }),
  ])
}

export async function clearLimit(email: string, purpose: LimitPurpose) {
  await prisma.authEmailLimit.deleteMany({ where: { email: normaliseEmail(email), purpose } })
}
