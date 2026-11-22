import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { recordNotice } from '@/server/notifications/record'
import { textsFor, type NoticeRecipient } from '@/server/notifications/texts'

// Notices recorded by spec 004 (FR-009; data-model.md › Notifications recorded by 004, research.md
// R9). One row per recipient and submission: a newer notice replaces the earlier one and is unread
// again. The text is in the RECIPIENT's language. 006 delivers them.

type LessonRef = { id: string; title: string; courseTitle: string }

/** "{student} submitted {lesson}" for an actively linked Admin; links to the review screen. */
export async function submittedNotice({
  admin,
  student,
  lesson,
  submissionId,
}: {
  admin: NoticeRecipient
  student: { id: string; displayName: string }
  lesson: LessonRef
  submissionId: string
}) {
  const { t } = await textsFor(admin)
  await recordNotice({
    userId: admin.id,
    sourceId: submissionId,
    occurrenceKey: 'submitted',
    title: t('submittedTitle', { student: student.displayName, lesson: lesson.title }),
    body: t('submittedBody', { course: lesson.courseTitle }),
    url: `/a/students/${student.id}/lessons/${lesson.id}`,
  })
}

/**
 * "{lesson}: reviewed" / "{lesson}: needs redo" for the student; opens the Assignment tab. `db` is the
 * review's transaction (research.md R9).
 */
export async function reviewedNotice(
  {
    student,
    admin,
    lesson,
    status,
    submissionId,
  }: {
    student: NoticeRecipient
    admin: { displayName: string }
    lesson: LessonRef
    status: 'reviewed' | 'needs_redo'
    submissionId: string
  },
  db?: Prisma.TransactionClient,
) {
  const { t } = await textsFor(student)
  const redo = status === 'needs_redo'
  await recordNotice(
    {
      userId: student.id,
      sourceId: submissionId,
      occurrenceKey: 'reviewed',
      title: t(redo ? 'needsRedoTitle' : 'reviewedTitle', { lesson: lesson.title }),
      body: t(redo ? 'needsRedoBody' : 'reviewedBody', { admin: admin.displayName }),
      url: `/s/lessons/${lesson.id}?tab=assignment`,
    },
    db,
  )
}
