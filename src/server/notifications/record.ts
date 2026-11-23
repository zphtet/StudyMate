import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

// Notices recorded by the app (spec 003 FR-012, research.md R8). 006 delivers new rows by push and
// shows them in the inbox; 003 only writes them. One row per (source, user, occurrence): a newer
// notice about the same item replaces the earlier one, read or not, and shows as unread again.
// A row is pending until 006's dispatcher delivers it; a replaced notice is pending again, so it goes
// out once more (006 research R1, FR-009).
// Callers MUST have run a guard and render the text in the recipient's own language.

export type NoticeInput = {
  userId: string
  /** The course or lesson the notice is about. Never null: a null would defeat the unique key. */
  sourceId: string
  /** e.g. 'assigned' or 'deadline' */
  occurrenceKey: string
  title: string
  body: string
  url: string | null
}

/** `db` is a transaction client when the notice must be written with the change it is about. */
export async function recordNotice(
  { userId, sourceId, occurrenceKey, ...text }: NoticeInput,
  db: Prisma.TransactionClient = prisma,
) {
  const sentAt = new Date()
  const pending = { deliverAt: sentAt, deliveredAt: null }
  await db.notification.upsert({
    where: {
      sourceType_sourceId_userId_occurrenceKey: {
        sourceType: 'system',
        sourceId,
        userId,
        occurrenceKey,
      },
    },
    create: { userId, sourceType: 'system', sourceId, occurrenceKey, ...text, sentAt, ...pending },
    update: { ...text, sentAt, readAt: null, ...pending },
  })
}
