import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { fail } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { mondayOf, startOfLocalDay, todayIn } from '@/lib/time'
import type { MessageWhen, ScheduleMessageInput, UpdateMessageInput } from './schemas'
import type { Availability, MessageData, MessageLists, MessageView, RecipientState } from './types'

// The Admin's one-off messages (spec 006 US3; contracts/server-actions.md › Messages; research R11).
// Callers MUST have run `requireRole('admin')`, and `requireAdminOfAll` for the students named; every
// `where` has `adminId`. The dispatcher hands each recipient over when its `deliver_at` comes.

const messageSelect = {
  id: true,
  body: true,
  mode: true,
  urgent: true,
  status: true,
  createdAt: true,
  lesson: { select: { id: true, title: true } },
  recipients: {
    orderBy: { student: { displayName: 'asc' } },
    select: {
      deliverAt: true,
      deliveredAt: true,
      student: { select: { id: true, displayName: true, timezone: true } },
    },
  },
} satisfies Prisma.ScheduledMessageSelect

type MessageRow = Prisma.ScheduledMessageGetPayload<{ select: typeof messageSelect }>

/**
 * Read status comes from the delivered `notifications` rows (data-model.md › Derived values), one
 * query for any number of messages.
 */
async function toViews(rows: MessageRow[]): Promise<MessageView[]> {
  const deliveries =
    rows.length === 0
      ? []
      : await prisma.notification.findMany({
          where: { sourceType: 'message', sourceId: { in: rows.map((r) => r.id) } },
          select: { sourceId: true, userId: true, deliveredAt: true, readAt: true },
        })
  const stateOf = (messageId: string, studentId: string): RecipientState => {
    const row = deliveries.find((d) => d.sourceId === messageId && d.userId === studentId)
    if (!row?.deliveredAt) return 'scheduled'
    return row.readAt ? 'read' : 'delivered'
  }
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    lesson: row.lesson,
    mode: row.mode,
    urgent: row.urgent,
    // `sending` isn't used (data-model.md ScheduledMessage.status).
    status: row.status === 'sending' ? 'scheduled' : row.status,
    recipients: row.recipients.map((r) => ({
      student: r.student,
      deliverAt: r.deliverAt.toISOString(),
      state: stateOf(row.id, r.student.id),
    })),
  }))
}

const oneView = async (row: MessageRow) => ({ message: (await toViews([row]))[0] })

/** The lesson must be Published in an Active course of the Admin assigned to every student. */
async function requireReadableLesson(adminId: string, lessonId: string, studentIds: string[]) {
  const assigned = await prisma.courseAssignment.count({
    where: {
      studentId: { in: studentIds },
      status: 'active',
      course: {
        ownerId: adminId,
        status: 'active',
        deletedAt: null,
        lessons: { some: { id: lessonId, status: 'published', deletedAt: null } },
      },
    },
  })
  if (assigned < studentIds.length) fail('lesson_not_found')
}

/**
 * Each recipient's planned moment (research R11): now, the chosen instant, or that student's own next
 * free moment at scheduling (`next_free_at`, one statement).
 */
async function plannedTimes(studentIds: string[], when: MessageWhen, now: Date) {
  if (when.mode === 'next_free') {
    const rows = await prisma.$queryRaw<{ id: string; at: Date }[]>`
      select s.id::text, next_free_at(s.id, ${now}::timestamptz) as at
      from unnest(${studentIds}::uuid[]) as s(id)`
    return { sendAt: null, at: new Map(rows.map((r) => [r.id, r.at])) }
  }
  const at = when.mode === 'now' ? now : new Date(when.at)
  if (at < now) fail('message_time_past')
  return { sendAt: at, at: new Map(studentIds.map((id) => [id, at])) }
}

const plannedFor = (planned: Map<string, Date>, studentId: string) =>
  planned.get(studentId) ?? fail('student_not_found')

export async function scheduleMessage(
  adminId: string,
  input: ScheduleMessageInput,
  now: Date,
): Promise<MessageData> {
  const lessonId = input.lessonId ?? null
  if (lessonId) await requireReadableLesson(adminId, lessonId, input.studentIds)
  const { sendAt, at } = await plannedTimes(input.studentIds, input.when, now)
  const row = await prisma.scheduledMessage.create({
    data: {
      adminId,
      body: input.body,
      lessonId,
      mode: input.when.mode,
      sendAt,
      urgent: input.urgent,
      recipients: {
        create: input.studentIds.map((studentId) => ({
          studentId,
          deliverAt: plannedFor(at, studentId),
        })),
      },
    },
    select: messageSelect,
  })
  return oneView(row)
}

/** The caller's message with who has been handed over, or `message_not_found`. */
async function ownMessage(adminId: string, id: string) {
  const row = await prisma.scheduledMessage.findFirst({
    where: { id, adminId, status: { not: 'cancelled' } },
    select: { status: true, recipients: { select: { studentId: true, deliveredAt: true } } },
  })
  if (!row) fail('message_not_found')
  const handed = row.recipients.filter((r) => r.deliveredAt !== null).map((r) => r.studentId)
  if (row.status === 'sent' || handed.length === row.recipients.length) fail('message_already_sent')
  return { handed }
}

/**
 * Edit until sent (FR-006): the text, lesson, time and urgency, and who gets it. Recipients already
 * handed over keep what they got; the others are replaced.
 */
export async function updateMessage(
  adminId: string,
  { id, ...input }: UpdateMessageInput,
  now: Date,
): Promise<MessageData> {
  const { handed } = await ownMessage(adminId, id)
  const lessonId = input.lessonId ?? null
  if (lessonId) await requireReadableLesson(adminId, lessonId, input.studentIds)
  const pending = input.studentIds.filter((studentId) => !handed.includes(studentId))
  const { sendAt, at } = await plannedTimes(pending, input.when, now)

  const row = await prisma.$transaction(async (tx) => {
    await tx.scheduledMessageRecipient.deleteMany({ where: { messageId: id, deliveredAt: null } })
    await tx.scheduledMessageRecipient.createMany({
      data: pending.map((studentId) => ({
        messageId: id,
        studentId,
        deliverAt: plannedFor(at, studentId),
      })),
    })
    return tx.scheduledMessage.update({
      where: { id, adminId },
      data: { body: input.body, lessonId, mode: input.when.mode, sendAt, urgent: input.urgent },
      select: messageSelect,
    })
  })
  return oneView(row)
}

/**
 * Cancel send (FR-006). If some recipients already got it, the rest are dropped and the message
 * counts as sent. If none did, the recipients stay so Alerts still shows who it was for; a cancelled
 * message is never handed over.
 */
export async function cancelMessage(adminId: string, { id }: { id: string }) {
  const { handed } = await ownMessage(adminId, id)
  const status = handed.length > 0 ? 'sent' : 'cancelled'
  await prisma.$transaction(async (tx) => {
    if (status === 'sent') {
      await tx.scheduledMessageRecipient.deleteMany({ where: { messageId: id, deliveredAt: null } })
    }
    await tx.scheduledMessage.update({ where: { id, adminId }, data: { status } })
  })
  return { status }
}

export async function getMessage(adminId: string, id: string): Promise<MessageData> {
  const row = await prisma.scheduledMessage.findFirst({
    where: { id, adminId },
    select: messageSelect,
  })
  if (!row) throw new NotFound('message_not_found')
  return oneView(row)
}

/** When a message went: its last hand-over, or when it was made (a cancelled one). */
const wentAt = (row: MessageRow) =>
  row.recipients.reduce<Date>(
    (latest, r) => (r.deliveredAt && r.deliveredAt > latest ? r.deliveredAt : latest),
    row.createdAt,
  )

/**
 * Alerts' messages for one student or all (contracts/route-handlers.md › GET /api/alerts): the
 * scheduled ones soonest first, then this week's sent and cancelled ones newest first. The week is
 * the Admin's own Monday to Sunday.
 */
export async function listMessages(
  adminId: string,
  studentId: string | null,
  { now, timeZone }: { now: Date; timeZone: string },
): Promise<MessageLists> {
  const weekStart = startOfLocalDay(mondayOf(todayIn(timeZone, now)), timeZone)
  const forStudent = studentId ? { recipients: { some: { studentId } } } : {}
  const [scheduledRows, recentRows] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where: { adminId, status: 'scheduled', ...forStudent },
      select: messageSelect,
    }),
    prisma.scheduledMessage.findMany({
      where: {
        adminId,
        status: { in: ['sent', 'cancelled'] },
        ...forStudent,
        OR: [
          { createdAt: { gte: weekStart } },
          { recipients: { some: { deliveredAt: { gte: weekStart } } } },
        ],
      },
      select: messageSelect,
    }),
  ])
  const firstDue = (row: MessageRow) =>
    Math.min(...row.recipients.map((r) => r.deliverAt.getTime()))
  const recent = recentRows
    .filter((row) => wentAt(row) >= weekStart)
    .sort((a, b) => wentAt(b).getTime() - wentAt(a).getTime())
  const [scheduled, recentViews] = await Promise.all([
    toViews(scheduledRows.sort((a, b) => firstDue(a) - firstDue(b))),
    toViews(recent),
  ])
  return {
    scheduled,
    recent: recentViews,
    sentThisWeek: recentViews.filter((m) => m.status === 'sent').length,
  }
}

/**
 * The composer's check (US3 scenario 4; research R11): whether `at` is free for each student, or a
 * shift, sleep (sleep blocks and outside waking hours) or quiet hours, and their next free moment.
 * One statement over `busy_segments` and `next_free_at`.
 */
export async function availability(studentIds: string[], at: Date): Promise<Availability> {
  const rows = await prisma.$queryRaw<{ id: string; kind: string | null; next_free: Date }[]>`
    select p.id::text,
           (select b.kind
              from busy_segments(p.id, ${at}::timestamptz - interval '1 day',
                                 ${at}::timestamptz + interval '1 day') b
             where b.start_at <= ${at} and b.end_at > ${at}
             order by case b.kind when 'shift' then 1 when 'sleep' then 2 when 'quiet' then 3
                      else 4 end
             limit 1) as kind,
           next_free_at(p.id, ${at}::timestamptz) as next_free
    from profiles p
    where p.id = any(${studentIds}::uuid[])`
  const stateOf = (kind: string | null) =>
    kind === 'shift' || kind === 'quiet' ? kind : kind ? ('sleep' as const) : ('free' as const)
  return {
    students: rows.map((row) => ({
      id: row.id,
      state: stateOf(row.kind),
      nextFree: row.next_free.toISOString(),
    })),
  }
}
