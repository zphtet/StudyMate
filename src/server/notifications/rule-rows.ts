import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { renderMessage } from '@/lib/notifications/render'
import { ruleConfigFrom, type RuleConfig } from '@/lib/notifications/rule-config'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import type { Email } from './email'
import type { Occurrence, WeekSummary } from './occurrences'
import type { RuleTarget } from './rule-data'
import { textsFor } from './texts'

// Rule reminders as `notifications` rows (spec 006 research R2 step 1, R12, R13): the text is
// rendered when the row is created, in the recipient's language, with `{due}` in the student's zone
// (data-model.md Notification.title, Notification.body, Notification.url). Also the owner's "Copy me"
// copies (FR-018) and the weekly summary email (FR-019).

type Texts = Awaited<ReturnType<typeof textsFor>>

/** The rule's title, e.g. "Daily study reminder" (the push notification's title). */
export const ruleTitle = (tr: Texts['tr'], config: RuleConfig) =>
  tr(
    `ruleSummary.title.${config.trigger}`,
    config.trigger === 'inactive' ? { days: config.days } : {},
  )

/** "2 h 10 min" */
function duration(tr: Texts['tr'], seconds: number) {
  const minutes = Math.round(seconds / 60)
  return tr('weeklySummary.duration', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

/** The student's week: lessons done, study time and streak, overdue work, the next deadlines. */
function weekLines({ tr, day, list }: Texts, summary: WeekSummary) {
  const lines = [
    tr('weeklySummary.facts', {
      lessons: summary.lessonsDone,
      time: duration(tr, summary.studySeconds),
      streak: summary.streak,
    }),
  ]
  if (summary.overdue > 0) lines.push(tr('weeklySummary.overdue', { count: summary.overdue }))
  lines.push(
    summary.next.length > 0
      ? tr('weeklySummary.next', {
          list: list(
            summary.next.map((n) =>
              tr('weeklySummary.nextItem', { lesson: n.lesson, due: day(n.dueAt) }),
            ),
          ),
        })
      : tr('weeklySummary.noNext'),
  )
  return lines
}

const lines = (...parts: string[]) => parts.filter((part) => part !== '').join('\n')

/** One occurrence as a row for its recipient: the student, or the rule's owner for `to: admin`. */
export async function ruleRow(
  { rule, student, owner }: RuleTarget,
  occurrence: Occurrence,
  now: Date,
): Promise<Prisma.NotificationCreateManyInput> {
  const recipient = occurrence.to === 'student' ? student : owner
  const texts = await textsFor(recipient)
  const { tr, when, day } = texts
  const { values } = occurrence
  const message = (name: string | null) =>
    renderMessage(rule.message, {
      name,
      lesson: values.lesson,
      course: values.course,
      // The recipient here is the student, so `when` reads the student's zone (FR-005).
      due: values.dueAt ? when(values.dueAt) : null,
    })

  const text = ((): { title: string; body: string; url: string } => {
    if (values.lines) {
      return {
        title: tr('weeklySummary.adminTitle', { count: values.lines.length }),
        body: lines(
          message(null),
          ...values.lines.map(({ name, summary }) =>
            tr('weeklySummary.studentLine', {
              name,
              lessons: summary.lessonsDone,
              time: duration(tr, summary.studySeconds),
              streak: summary.streak,
              overdue: summary.overdue,
            }),
          ),
        ),
        url: '/a/students',
      }
    }
    if (values.summary) {
      return {
        title: tr('weeklySummary.title'),
        body: lines(message(student.displayName), ...weekLines(texts, values.summary)),
        url: '/s/progress',
      }
    }
    if (occurrence.to === 'admin' && rule.config.trigger === 'inactive' && values.lastActive) {
      return {
        title: tr('pushTexts.inactiveAdminTitle', {
          name: student.displayName,
          days: rule.config.days,
        }),
        body: tr('pushTexts.inactiveAdminBody', {
          date: day(zonedToUtc(values.lastActive, '12:00', student.timezone)),
        }),
        url: `/a/students/${student.id}`,
      }
    }
    return {
      title: ruleTitle(tr, rule.config),
      body: message(student.displayName),
      url: values.lessonId ? `/s/lessons/${values.lessonId}` : '/s/today',
    }
  })()

  return {
    userId: recipient.id,
    sourceType: 'rule',
    sourceId: rule.id,
    occurrenceKey: occurrence.key,
    ...text,
    sentAt: now,
    deliverAt: occurrence.at,
    expiresAt: occurrence.expiresAt,
    push: rule.channels.includes('push'),
  }
}

/** A delivered row, as the dispatcher claimed it. */
export type DeliveredRow = {
  user_id: string
  source_type: string
  source_id: string | null
  occurrence_key: string
  body: string
}

/**
 * "Copy me" (FR-018): a copy of each delivered rule reminder in the owner's inbox only (`push` false),
 * keyed `{studentId}:{key}` (data-model.md › Occurrence keys). Made when the student's row is
 * delivered, so a reminder that lapsed leaves no copy. It then waits for the owner's own hours.
 */
export async function copyRows(
  delivered: DeliveredRow[],
  now: Date,
): Promise<Prisma.NotificationCreateManyInput[]> {
  const ruleIds = [
    ...new Set(
      delivered.flatMap((r) => (r.source_type === 'rule' && r.source_id ? [r.source_id] : [])),
    ),
  ]
  if (ruleIds.length === 0) return []
  const rules = await prisma.notificationRule.findMany({
    where: { id: { in: ruleIds }, channels: { has: 'copy' } },
    select: {
      id: true,
      trigger: true,
      config: true,
      owner: { select: { id: true, timezone: true, locale: true } },
    },
  })
  const copied = delivered.flatMap((row) => {
    const rule = rules.find((r) => r.id === row.source_id)
    // The owner's own rows (`to: admin`) aren't copied again.
    return rule && rule.owner.id !== row.user_id ? [{ row, rule }] : []
  })
  if (copied.length === 0) return []
  const students = await prisma.profile.findMany({
    where: { id: { in: [...new Set(copied.map(({ row }) => row.user_id))] } },
    select: { id: true, displayName: true },
  })

  return Promise.all(
    copied.map(async ({ row, rule }) => {
      const { tr } = await textsFor(rule.owner)
      const name = students.find((s) => s.id === row.user_id)?.displayName ?? ''
      return {
        userId: rule.owner.id,
        sourceType: 'rule',
        sourceId: rule.id,
        occurrenceKey: `${row.user_id}:${row.occurrence_key}`,
        title: tr('pushTexts.copyTitle', {
          name,
          title: ruleTitle(tr, ruleConfigFrom(rule.trigger, rule.config)),
        }),
        body: row.body,
        url: `/a/students/${row.user_id}`,
        sentAt: now,
        deliverAt: now,
        push: false,
      }
    }),
  )
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c])

/**
 * The weekly summary by email (research R13): plain HTML from the delivered row, which is already in
 * the recipient's language, with a link to the app. Text the Admin wrote is escaped.
 */
export function summaryEmail(
  row: { title: string; body: string; url: string | null },
  { to, linkLabel }: { to: string; linkLabel: string },
): Email {
  const href = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}${row.url ?? '/'}`
  const paragraphs = row.body
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
  return {
    to,
    subject: row.title,
    html: `<h1>${escapeHtml(row.title)}</h1>${paragraphs}<p><a href="${escapeHtml(href)}">${escapeHtml(linkLabel)}</a></p>`,
  }
}
