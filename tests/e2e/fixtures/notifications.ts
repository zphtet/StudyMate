import { randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { sql } from './db'

// Spec 006 T017: seed what the notification stories need but other screens create (rules, messages,
// delivered rows, quiet hours), and run the dispatcher the way pg_cron does. Every row cascades with
// its users, so global-teardown needs nothing more.

type Trigger =
  'daily' | 'after_shift' | 'due_soon' | 'overdue' | 'streak_risk' | 'inactive' | 'weekly_summary'

/**
 * An inbox row (data-model.md Notification). Delivered now unless `deliveredAt` is null, which
 * leaves it pending for the dispatcher. Returns its id.
 */
export async function seedNotification({
  userId,
  title,
  body,
  url = null,
  sourceType = 'system',
  sourceId = null,
  occurrenceKey = `seed-${randomUUID()}`,
  deliveredAt = new Date().toISOString(),
  readAt = null,
  push = true,
  urgent = false,
}: {
  userId: string
  title: string
  body: string
  url?: string | null
  sourceType?: 'system' | 'rule' | 'message'
  sourceId?: string | null
  occurrenceKey?: string
  deliveredAt?: string | null
  readAt?: string | null
  push?: boolean
  urgent?: boolean
}) {
  const [row] = await sql<{ id: string }>(
    `insert into notifications (user_id, source_type, source_id, occurrence_key, title, body, url,
                                deliver_at, delivered_at, read_at, push, urgent)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $8, $9, $10, $11)
     returning id`,
    [
      userId,
      sourceType,
      sourceId,
      occurrenceKey,
      title,
      body,
      url,
      deliveredAt,
      readAt,
      push,
      urgent,
    ],
  )
  return row.id
}

/**
 * A rule (data-model.md NotificationRule.owner_id, NotificationRule.student_id,
 * NotificationRule.config, NotificationRule.channels, NotificationRule.enabled). `config` is stored
 * as given, without the trigger. Returns its id.
 */
export async function seedRule({
  ownerId,
  studentId,
  trigger,
  config,
  message,
  channels = ['push'],
  enabled = true,
}: {
  ownerId: string
  studentId: string | null
  trigger: Trigger
  config: Record<string, unknown>
  message: string
  channels?: ('push' | 'copy')[]
  enabled?: boolean
}) {
  const [row] = await sql<{ id: string }>(
    `insert into notification_rules (owner_id, student_id, trigger, config, message, channels, enabled)
     values ($1, $2, $3, $4::jsonb, $5, $6::text[], $7) returning id`,
    [ownerId, studentId, trigger, JSON.stringify(config), message, channels, enabled],
  )
  return row.id
}

/**
 * A scheduled one-off message with one recipient row per student, all planned for `deliverAt`
 * (data-model.md ScheduledMessage, ScheduledMessageRecipient). Returns its id.
 */
export async function seedMessage({
  adminId,
  studentIds,
  body,
  deliverAt,
  lessonId = null,
  urgent = false,
}: {
  adminId: string
  studentIds: string[]
  body: string
  deliverAt: string
  lessonId?: string | null
  urgent?: boolean
}) {
  const [row] = await sql<{ id: string }>(
    `insert into scheduled_messages (admin_id, body, lesson_id, mode, send_at, urgent)
     values ($1, $2, $3, 'fixed', $4, $5) returning id`,
    [adminId, body, lessonId, deliverAt, urgent],
  )
  await sql(
    `insert into scheduled_message_recipients (message_id, student_id, deliver_at)
     select $1, unnest($2::uuid[]), $3`,
    [row.id, studentIds, deliverAt],
  )
  return row.id
}

/** Quiet hours on the profile (data-model.md Profile.quiet_start, Profile.quiet_end); null = none. */
export async function setQuietHours(userId: string, start: string | null, end: string | null) {
  await sql(`update profiles set quiet_start = $2::time, quiet_end = $3::time where id = $1`, [
    userId,
    start,
    end,
  ])
}

/** POST /api/cron/dispatch with the cron secret, as pg_cron does (quickstart.md §6). */
export async function runDispatch(request: APIRequestContext) {
  const response = await request.post('/api/cron/dispatch', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  if (!response.ok())
    throw new Error(`dispatch failed: ${response.status()} ${await response.text()}`)
  return response.json()
}

/** The user's registered devices (data-model.md PushSubscription). */
export async function pushSubscriptionsOf(userId: string) {
  return sql<{ endpoint: string }>(`select endpoint from push_subscriptions where user_id = $1`, [
    userId,
  ])
}
