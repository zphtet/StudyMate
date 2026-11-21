import 'server-only'
import { prisma } from '@/lib/prisma'

// Notices recorded by the app (spec 003 FR-012, research.md R8). 006 delivers new rows by push and
// shows them in the inbox; 003 only writes them. One row per (source, user, occurrence): a newer
// notice about the same item replaces the earlier one, read or not, and shows as unread again.
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

export async function recordNotice({ userId, sourceId, occurrenceKey, ...text }: NoticeInput) {
  const sentAt = new Date()
  await prisma.notification.upsert({
    where: {
      sourceType_sourceId_userId_occurrenceKey: {
        sourceType: 'system',
        sourceId,
        userId,
        occurrenceKey,
      },
    },
    create: { userId, sourceType: 'system', sourceId, occurrenceKey, ...text, sentAt },
    update: { ...text, sentAt, readAt: null },
  })
}
