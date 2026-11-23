import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { weekCheck } from '@/lib/week-check'
import type { EmailSender } from './email'
import type { PushPayload, PushSender } from './push'
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

export async function dispatch(
  now: Date,
  deps: DispatchDeps,
  scope?: DispatchScope,
): Promise<DispatchResult> {
  const only = (column: Prisma.Sql) =>
    scope ? Prisma.sql`and ${column} = any(${scope.userIds}::uuid[])` : Prisma.empty

  const occurrences = await createRuleOccurrences()
  const handedOver = await handOverMessages()
  await createWeekChecks(now, only)
  const lapsed = await dropSettledWeekChecks(only)
  const postponed = await holdForBusyRecipients(now, only)
  const delivery = await deliverDue(now, deps.push, only)
  await purgeOld(now, only)
  return { occurrences, handedOver, postponed, lapsed, ...delivery }
}

type Only = (column: Prisma.Sql) => Prisma.Sql

/** Step 1 (research R2, R3): rule occurrences due in the look-back window become rows. US2. */
async function createRuleOccurrences() {
  return 0
}

/** Step 2 (research R2, R11): due message recipients become rows. US3. */
async function handOverMessages() {
  return 0
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
 * Step 3 (FR-003; research R2, R14): rows due for a recipient who is on shift, asleep, outside waking
 * hours or in quiet hours move to their next free moment (data-model.md Notification.deliver_at).
 * One `next_free_at` per recipient, in one statement. Urgent rows go anyway
 * (data-model.md Notification.urgent).
 */
async function holdForBusyRecipients(now: Date, only: Only) {
  return prisma.$executeRaw`
    with due as (
      select distinct user_id from notifications
      where delivered_at is null and deliver_at <= ${now} and not urgent ${only(Prisma.sql`user_id`)}
    ), free as (
      select user_id, next_free_at(user_id, ${now}) as at from due
    )
    update notifications n set deliver_at = f.at
    from free f
    where n.user_id = f.user_id and n.delivered_at is null and n.deliver_at <= ${now}
      and not n.urgent and f.at > ${now}`
}

type DueRow = {
  id: string
  user_id: string
  title: string
  body: string
  url: string | null
  push: boolean
  role: 'student' | 'admin'
}

/**
 * Step 4 (research R2, R5, R6): rows due now are claimed (delivered_at set) before anything is sent,
 * so a retry or a second run never sends them twice (FR-004). Then one push per row with `push`
 * (data-model.md Notification.push) to every device of its recipient, with the row's stored title,
 * body and url (data-model.md Notification.title, Notification.body, Notification.url). A device the
 * push service no longer knows is removed; other failures still count as delivered (the inbox has it).
 */
async function deliverDue(now: Date, sender: PushSender, only: Only) {
  const due = await prisma.$queryRaw<DueRow[]>`
    update notifications n set delivered_at = ${now}
    from profiles p
    where p.id = n.user_id and n.id in (
      select id from notifications
      where delivered_at is null and deliver_at <= ${now} ${only(Prisma.sql`user_id`)}
      for update skip locked)
    returning n.id::text, n.user_id::text, n.title, n.body, n.url, n.push, p.role::text as role`

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

  return {
    delivered: due.length,
    pushes: results.filter((r) => r.result === 'ok').length,
    removedDevices: gone.length,
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
