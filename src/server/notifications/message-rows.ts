import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { renderMessage } from '@/lib/notifications/render'
import { textsFor } from './texts'

// A one-off message's delivery as a `notifications` row (spec 006 research R2 step 2, R11, R12): the
// Admin's text with its variables filled for the student, in the student's language and zone; a
// linked lesson opens on tap (FR-005).

/** A recipient the dispatcher just handed over, with what its text needs. */
export type HandedOver = {
  message_id: string
  student_id: string
  deliver_at: Date
  body: string
  urgent: boolean
  lesson_id: string | null
  lesson: string | null
  course: string | null
  /** The lesson's effective deadline for this student (003 FR-004), for `{due}`. */
  due_at: Date | null
  student_name: string
  locale: string
  timezone: string
  admin_name: string
}

export async function messageRow(
  r: HandedOver,
  now: Date,
): Promise<Prisma.NotificationCreateManyInput> {
  const { tr, when } = await textsFor({ id: r.student_id, locale: r.locale, timezone: r.timezone })
  return {
    userId: r.student_id,
    sourceType: 'message',
    sourceId: r.message_id,
    occurrenceKey: 'message',
    title: tr('pushTexts.messageTitle', { admin: r.admin_name }),
    body: renderMessage(r.body, {
      name: r.student_name,
      lesson: r.lesson,
      course: r.course,
      due: r.due_at ? when(r.due_at) : null,
    }),
    url: r.lesson_id ? `/s/lessons/${r.lesson_id}` : null,
    sentAt: now,
    // The planned moment; the availability step holds it from there unless urgent (FR-003).
    deliverAt: r.deliver_at,
    urgent: r.urgent,
  }
}
