import 'server-only'
import { createFormatter, createTranslator } from 'next-intl'
import { hasLocale, type Locale } from '@/i18n/locales'
import { recordNotice } from '@/server/notifications/record'

// Notice texts for spec 003 (FR-012; data-model.md › Notifications recorded by 003). The student
// reads them later (006 delivers), so they are written in the STUDENT's language with times in the
// student's zone. createTranslator works outside a request (Server Actions, tests), unlike
// getTranslations, which reads the viewer's cookies.

export type NoticeStudent = { id: string; locale: string; timezone: string }

async function textsFor(student: NoticeStudent) {
  const locale: Locale = hasLocale(student.locale) ? student.locale : 'en'
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'notices' })
  const format = createFormatter({ locale, timeZone: student.timezone })
  const when = (at: Date) =>
    format.dateTime(at, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  return { t, when }
}

/** "New course: {course}" — only for students newly assigned or reassigned with "Notify now". */
export async function assignedNotice({
  student,
  admin,
  course,
  dueAt,
}: {
  student: NoticeStudent
  admin: { displayName: string }
  course: { id: string; title: string }
  dueAt: Date | null
}) {
  const { t, when } = await textsFor(student)
  await recordNotice({
    userId: student.id,
    sourceId: course.id,
    occurrenceKey: 'assigned',
    title: t('assignedTitle', { course: course.title }),
    body: dueAt
      ? t('assignedBodyDue', { admin: admin.displayName, due: when(dueAt) })
      : t('assignedBody', { admin: admin.displayName }),
    url: `/s/courses/${course.id}`,
  })
}

/** "{item} is now due {date}" / "{item} no longer has a deadline" (spec US2 scenario 6). */
export async function deadlineNotice({
  student,
  admin,
  item,
  dueAt,
}: {
  student: NoticeStudent
  admin: { displayName: string }
  item: { kind: 'course' | 'lesson'; id: string; title: string }
  dueAt: Date | null
}) {
  const { t, when } = await textsFor(student)
  await recordNotice({
    userId: student.id,
    sourceId: item.id,
    occurrenceKey: 'deadline',
    title: dueAt
      ? t('deadlineTitle', { item: item.title, due: when(dueAt) })
      : t('deadlineRemovedTitle', { item: item.title }),
    body: t('deadlineBody', { admin: admin.displayName }),
    url: item.kind === 'course' ? `/s/courses/${item.id}` : `/s/lessons/${item.id}`,
  })
}

/** Default reminder messages (FR-013) in the student's language. */
export async function defaultReminderMessages(student: NoticeStudent) {
  const locale: Locale = hasLocale(student.locale) ? student.locale : 'en'
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'reminders.default' })
  return {
    daily: t('daily'),
    due_soon: t('due_soon'),
    overdue: t('overdue'),
    streak_risk: t('streak_risk'),
  }
}
