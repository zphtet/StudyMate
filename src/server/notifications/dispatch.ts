import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { RuleTrigger } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { weekCheck } from '@/lib/week-check'
import { emailAddresses, type EmailSender } from './email'
import {
  adminWeeklySummary,
  occurrences,
  stillApplies,
  type StudentData,
  type Window,
} from './occurrences'
import { messageRow, type HandedOver } from './message-rows'
import type { PushPayload, PushSender } from './push'
import { loadRuleTargets, loadStudentData, type Only, type RuleTarget } from './rule-data'
import { copyRows, ruleRow, summaryEmail, type DeliveredRow } from './rule-rows'
import { textsFor } from './texts'

// The dispatcher (spec 006 research R2): POST /api/cron/dispatch runs it every 5 minutes (pg_cron).
// Every delivery is a `notifications` row (R1): rule occurrences and one-off messages become rows,
// rows wait while their recipient is busy, rows that no longer apply are dropped, and due rows go
// to every device and the inbox. Each step is a fixed number of set-based statements, whatever the
// number of users (SC-001). No user guard: it serves everyone (plan.md › Complexity Tracking).

export type DispatchDeps = { push: PushSender; email: EmailSender }

/** Tests only: the dev database is shared, so a test run touches its own users and nobody else. */
export type DispatchScope = { userIds: string[] }

/** contracts/route-handlers.md › Cron */
export type DispatchResult = {
  /** rule rows created */
  occurrences: number
  /** message recipients moved to rows */
  handedOver: number
  postponed: number
  lapsed: number
  delivered: number
  pushes: number
  removedDevices: number
}

/** The inbox keeps items this long (spec Assumptions). */
const RETENTION_DAYS = 90
/** The daily purge runs on the first tick after 03:00 UTC; ticks are 5 minutes apart (R9). */
const PURGE_HOUR_UTC = 3
const TICK_MINUTES = 5
/** Rule occurrences are looked for in (now − 15 min, now], so a late or missed tick loses nothing (R2). */
const LOOK_BACK_MINUTES = 15
const MINUTE = 60_000
const NO_DATA: StudentData = { lessons: [], activity: [], shifts: [] }

export async function dispatch(
  now: Date,
  deps: DispatchDeps,
  scope?: DispatchScope,
): Promise<DispatchResult> {
  const only = (column: Prisma.Sql) =>
    scope ? Prisma.sql`and ${column} = any(${scope.userIds}::uuid[])` : Prisma.empty

  const created = await createRuleOccurrences(now, only)
  const handedOver = await handOverMessages(now, only)
  await createWeekChecks(now, only)
  const settled = await dropSettledWeekChecks(only)
  const held = await holdForBusyRecipients(now, only)
  const stale = await dropStale(now, only)
  const delivery = await deliverDue(now, deps, only)
  await purgeOld(now, only)
  return {
    occurrences: created,
    handedOver,
    postponed: held.postponed,
    lapsed: settled + held.lapsed + stale,
    ...delivery,
  }
}

/**
 * Step 1 (research R2, R3; data-model.md Notification.source_type `rule`,
 * Notification.occurrence_key, Notification.expires_at): every occurrence due in the look-back window
 * becomes a row, rendered for its recipient. The unique key keeps it to one however many runs see it
 * (FR-004). A rule never fires for a moment before it existed.
 */
async function createRuleOccurrences(now: Date, only: Only) {
  const window: Window = { from: new Date(now.getTime() - LOOK_BACK_MINUTES * MINUTE), to: now }
  const targets = await loadRuleTargets(only)
  if (targets.length === 0) return 0
  const needsShifts = targets.some((t) => t.rule.config.trigger === 'after_shift')
  const data = await loadStudentData(
    targets.map((t) => t.student.id),
    needsShifts ? { shiftsIn: window } : {},
  )
  const windowOf = ({ rule }: RuleTarget): Window => ({
    from: rule.createdAt > window.from ? rule.createdAt : window.from,
    to: now,
  })

  const perStudent = targets.flatMap((target) =>
    occurrences(
      target.rule.config,
      target.student,
      data.get(target.student.id) ?? NO_DATA,
      windowOf(target),
    ).map((occurrence) => ruleRow(target, occurrence, now)),
  )

  // A weekly summary to the Admin is one row per rule and week, one line per student (FR-019).
  const byRule = Map.groupBy(
    targets.filter((t) => t.rule.config.trigger === 'weekly_summary'),
    (t) => t.rule.id,
  )
  const summaries = [...byRule.values()].flatMap(([first, ...rest]) => {
    const group = [first, ...rest]
    const occurrence = adminWeeklySummary(
      first.rule.config,
      first.owner,
      group.map(({ student }) => ({
        id: student.id,
        name: student.displayName,
        timezone: student.timezone,
        data: data.get(student.id) ?? NO_DATA,
      })),
      windowOf(first),
    )
    return occurrence ? [ruleRow(first, occurrence, now)] : []
  })

  const rows = await Promise.all([...perStudent, ...summaries])
  if (rows.length === 0) return 0
  const { count } = await prisma.notification.createMany({ data: rows, skipDuplicates: true })
  return count
}

/**
 * Step 2 (research R2, R11; data-model.md › Lifecycles › A scheduled message). First the Edge Cases:
 * an unlinked student's pending delivery is dropped, and a scheduled message left with no recipient
 * (all unlinked, or their profiles deleted) is cancelled. Then due recipients are claimed
 * (ScheduledMessageRecipient.delivered_at) and become rows in the same transaction, keyed `message`
 * (FR-004), and a message whose recipients have all been handed over is `sent`.
 */
async function handOverMessages(now: Date, only: Only) {
  await prisma.$executeRaw`
    delete from scheduled_message_recipients r using scheduled_messages m
    where m.id = r.message_id and m.status = 'scheduled' and r.delivered_at is null
      and not exists (
        select 1 from student_links l
        where l.admin_id = m.admin_id and l.student_id = r.student_id and l.status = 'active')
      ${only(Prisma.sql`r.student_id`)}`
  await prisma.$executeRaw`
    update scheduled_messages m set status = 'cancelled'
    where m.status = 'scheduled'
      and not exists (select 1 from scheduled_message_recipients r where r.message_id = m.id)
      ${only(Prisma.sql`m.admin_id`)}`

  const handedOver = await prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<HandedOver[]>`
      with claimed as (
        update scheduled_message_recipients r set delivered_at = ${now}
        from scheduled_messages m
        where m.id = r.message_id and m.status = 'scheduled'
          and r.delivered_at is null and r.deliver_at <= ${now}
          ${only(Prisma.sql`r.student_id`)}
        returning r.message_id, r.student_id, r.deliver_at
      )
      select c.message_id::text, c.student_id::text, c.deliver_at, m.body, m.urgent,
             m.lesson_id::text, l.title as lesson, co.title as course,
             case when m.lesson_id is null then null
                  else effective_due(c.student_id, m.lesson_id) end as due_at,
             s.display_name as student_name, s.locale, s.timezone, a.display_name as admin_name
      from claimed c
      join scheduled_messages m on m.id = c.message_id
      join profiles s on s.id = c.student_id
      join profiles a on a.id = m.admin_id
      left join lessons l on l.id = m.lesson_id
      left join courses co on co.id = l.course_id`
    if (due.length > 0) {
      const rows = await Promise.all(due.map((recipient) => messageRow(recipient, now)))
      await tx.notification.createMany({ data: rows, skipDuplicates: true })
    }
    return due.length
  })

  await prisma.$executeRaw`
    update scheduled_messages m set status = 'sent'
    where m.status = 'scheduled'
      and exists (select 1 from scheduled_message_recipients r where r.message_id = m.id)
      and not exists (
        select 1 from scheduled_message_recipients r
        where r.message_id = m.id and r.delivered_at is null)
      ${only(Prisma.sql`m.admin_id`)}`
  return handedOver
}

/**
 * 005's Sunday check as a notice (FR-010; 005 FR-009): from Sunday 18:00 in the student's time,
 * for students with any shift who haven't answered for the coming week. The SQL only narrows the
 * students; `weekCheck` (also used by the Today card) decides. Inserted once per week
 * (data-model.md Notification.source_type `system`, Notification.occurrence_key
 * `week-check@{monday}`), opening Shifts.
 */
async function createWeekChecks(now: Date, only: Only) {
  const students = await prisma.$queryRaw<
    { id: string; locale: string; timezone: string; confirmed_week: string | null }[]
  >`
    select p.id::text, p.locale, p.timezone, p.shifts_confirmed_week::text as confirmed_week
    from profiles p
    where p.role = 'student'
      and extract(isodow from (${now}::timestamptz at time zone p.timezone)) = 7
      and (${now}::timestamptz at time zone p.timezone)::time >= time '18:00'
      and exists (select 1 from shifts s where s.student_id = p.id)
      ${only(Prisma.sql`p.id`)}`

  const rows = await Promise.all(
    students.map(async (student) => {
      const check = weekCheck({
        now,
        timeZone: student.timezone,
        confirmedWeek: student.confirmed_week,
        hasShifts: true,
      })
      if (!check.due) return null
      const { t, day } = await textsFor(student)
      return {
        userId: student.id,
        sourceType: 'system',
        sourceId: student.id,
        occurrenceKey: `week-check@${check.week}`,
        title: t('weekCheckTitle'),
        body: t('weekCheckBody', { date: day(zonedToUtc(check.week, '12:00', student.timezone)) }),
        url: '/s/shifts',
        sentAt: now,
        deliverAt: now,
      }
    }),
  )
  const data = rows.filter((row) => row !== null)
  if (data.length > 0) await prisma.notification.createMany({ data, skipDuplicates: true })
}

/**
 * A Sunday check held by a shift is dropped once the student has confirmed that week (FR-010): Confirm
 * and Edit already answered it.
 */
async function dropSettledWeekChecks(only: Only) {
  return prisma.$executeRaw`
    delete from notifications n using profiles p
    where n.user_id = p.id and n.delivered_at is null
      and n.source_type = 'system' and n.occurrence_key like 'week-check@%'
      and p.shifts_confirmed_week >= substring(n.occurrence_key from 12)::date
      ${only(Prisma.sql`n.user_id`)}`
}

/**
 * Step 3 (FR-003, FR-017; research R2, R14): rows due for a recipient who is on shift, asleep, outside
 * waking hours or in quiet hours move to their next free moment (data-model.md
 * Notification.deliver_at). A rule reminder that would lapse by then is deleted instead
 * (Notification.expires_at): it is never sent and never in the inbox. One `next_free_at` per
 * recipient, in one statement. Urgent rows go anyway (Notification.urgent).
 */
async function holdForBusyRecipients(now: Date, only: Only) {
  const [counts] = await prisma.$queryRaw<{ lapsed: number; postponed: number }[]>`
    with due as (
      select distinct user_id from notifications
      where delivered_at is null and deliver_at <= ${now} and not urgent ${only(Prisma.sql`user_id`)}
    ), free as (
      select user_id, next_free_at(user_id, ${now}) as at from due
    ), busy as (
      select n.id, n.expires_at, f.at
      from notifications n join free f on f.user_id = n.user_id
      where n.delivered_at is null and n.deliver_at <= ${now} and not n.urgent and f.at > ${now}
    ), lapsed as (
      delete from notifications n using busy b
      where n.id = b.id and b.expires_at is not null and b.expires_at <= b.at
      returning n.id
    ), moved as (
      update notifications n set deliver_at = b.at from busy b
      where n.id = b.id and (b.expires_at is null or b.expires_at > b.at)
      returning n.id
    )
    select (select count(*) from lapsed)::int as lapsed, (select count(*) from moved)::int as postponed`
  return counts
}

/** A rule row about a student: the recipient, or the `{studentId}:` an Admin's row starts with. */
const ABOUT_STUDENT = /^([0-9a-f-]{36}):(.+)$/

/**
 * Just before delivery (research R4, FR-011, FR-017): rule rows past their lapse time are deleted,
 * and so are rows whose condition no longer holds: the lesson completed or its deadline moved or
 * removed (Due soon, Overdue), the student studied (Streak at risk, Inactive). The owner's
 * "Copy me" copies record a delivery that happened, so they aren't checked again. One batch.
 */
async function dropStale(now: Date, only: Only) {
  const expired = await prisma.$executeRaw`
    delete from notifications
    where delivered_at is null and deliver_at <= ${now} and expires_at <= ${now}
      ${only(Prisma.sql`user_id`)}`

  const held = await prisma.$queryRaw<
    { id: string; user_id: string; occurrence_key: string; trigger: RuleTrigger }[]
  >`
    select n.id::text, n.user_id::text, n.occurrence_key, r.trigger
    from notifications n join notification_rules r on r.id = n.source_id
    where n.source_type = 'rule' and n.delivered_at is null and n.deliver_at <= ${now}
      and r.trigger in ('due_soon', 'overdue', 'streak_risk', 'inactive')
      and (n.user_id <> r.owner_id or r.trigger = 'inactive')
      ${only(Prisma.sql`n.user_id`)}`
  if (held.length === 0) return expired

  const about = held.map((row) => {
    const match = ABOUT_STUDENT.exec(row.occurrence_key)
    return match
      ? { ...row, studentId: match[1], key: match[2] }
      : { ...row, studentId: row.user_id, key: row.occurrence_key }
  })
  const data = await loadStudentData(about.map((row) => row.studentId))
  const gone = about
    .filter((row) => !stillApplies(row.trigger, row.key, data.get(row.studentId) ?? NO_DATA))
    .map((row) => row.id)
  if (gone.length > 0) await prisma.notification.deleteMany({ where: { id: { in: gone } } })
  return expired + gone.length
}

type DueRow = DeliveredRow & {
  id: string
  title: string
  url: string | null
  push: boolean
  role: 'student' | 'admin'
  locale: string
  timezone: string
}

/**
 * Step 4 (research R2, R5, R6): rows due now are claimed (delivered_at set) before anything is sent,
 * so a retry or a second run never sends them twice (FR-004). Then one push per row with `push`
 * (data-model.md Notification.push) to every device of its recipient, with the row's stored title,
 * body and url (data-model.md Notification.title, Notification.body, Notification.url). A device the
 * push service no longer knows is removed; other failures still count as delivered (the inbox has it).
 */
async function deliverDue(now: Date, { push: sender, email }: DispatchDeps, only: Only) {
  const due = await prisma.$queryRaw<DueRow[]>`
    update notifications n set delivered_at = ${now}
    from profiles p
    where p.id = n.user_id and n.id in (
      select id from notifications
      where delivered_at is null and deliver_at <= ${now} ${only(Prisma.sql`user_id`)}
      for update skip locked)
    returning n.id::text, n.user_id::text, n.source_type, n.source_id::text, n.occurrence_key,
              n.title, n.body, n.url, n.push, p.role::text as role, p.locale, p.timezone`

  const toPush = due.filter((row) => row.push)
  const devices = toPush.length
    ? await prisma.pushSubscription.findMany({
        where: { userId: { in: [...new Set(toPush.map((row) => row.user_id))] } },
        select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
      })
    : []

  const sends = toPush.flatMap((row) =>
    devices
      .filter((device) => device.userId === row.user_id)
      .map(async (device) => ({ device, result: await sender.send(device, payloadOf(row)) })),
  )
  const results = await Promise.all(sends)
  const gone = [...new Set(results.filter((r) => r.result === 'gone').map((r) => r.device.id))]
  if (gone.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } })

  const copies = await copyRows(due, now)
  if (copies.length > 0)
    await prisma.notification.createMany({ data: copies, skipDuplicates: true })
  await emailSummaries(due, email)

  return {
    delivered: due.length,
    pushes: results.filter((r) => r.result === 'ok').length,
    removedDevices: gone.length,
  }
}

/**
 * The weekly summary also goes by email to the recipient's sign-in address (FR-001, FR-019; research
 * R13). The inbox already has it, so a refused email is reported and the run goes on.
 */
async function emailSummaries(due: DueRow[], sender: EmailSender) {
  const summaries = due.filter(
    (row) => row.source_type === 'rule' && row.occurrence_key.startsWith('week@'),
  )
  if (summaries.length === 0) return
  const addresses = await emailAddresses(summaries.map((row) => row.user_id))
  const sends = summaries.flatMap((row) => {
    const to = addresses.get(row.user_id)
    if (!to) return []
    return [
      textsFor({ id: row.user_id, locale: row.locale, timezone: row.timezone }).then(({ tr }) =>
        sender.send(summaryEmail(row, { to, linkLabel: tr('weeklySummary.emailLink') })),
      ),
    ]
  })
  for (const result of await Promise.allSettled(sends)) {
    if (result.status === 'rejected')
      console.error('[dispatch] weekly summary email', result.reason)
  }
}

/**
 * One row's phone notification. Tapping it opens the row's link, or the inbox, with `?n=<id>` so the
 * app marks it read (FR-007; research R9). `tag` is the row id, so a resent notice replaces the old one.
 */
function payloadOf(row: DueRow): PushPayload {
  const url = row.url ?? (row.role === 'admin' ? '/a/inbox' : '/s/inbox')
  return {
    title: row.title,
    body: row.body,
    url: `${url}${url.includes('?') ? '&' : '?'}n=${row.id}`,
    tag: row.id,
  }
}

/** Items older than 90 days are deleted once a day, on the first tick after 03:00 UTC (R9). */
async function purgeOld(now: Date, only: Only) {
  if (now.getUTCHours() !== PURGE_HOUR_UTC || now.getUTCMinutes() >= TICK_MINUTES) return
  await prisma.$executeRaw`
    delete from notifications
    where coalesce(delivered_at, deliver_at) < ${now}::timestamptz - make_interval(days => ${RETENTION_DAYS})
      ${only(Prisma.sql`user_id`)}`
}
