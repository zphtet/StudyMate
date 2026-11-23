import { z } from 'zod'
import { clockTime, ruleDays, ruleMessage } from '@/lib/notifications/rule-config'

// Spec 006 contracts/server-actions.md › Devices and inbox, quiet hours and personal reminders.
// Shared by the client and the actions.

/** What `PushSubscription.toJSON()` gives the browser (data-model.md PushSubscription.endpoint). */
export const savePushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  deviceLabel: z.string().trim().max(60).optional(),
})
export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionSchema>

export const deletePushSubscriptionSchema = z.object({ endpoint: z.url() })

export const markNotificationReadSchema = z.object({ id: z.uuid() })

/** GET /api/notifications?cursor= : the last item's id of the previous page. */
export const inboxCursorSchema = z.uuid().nullable().catch(null)

// Quiet hours and personal reminders (US5; contracts/server-actions.md). Shared with the Me sheet
// and the + Reminder sheet.

/**
 * data-model.md Profile.quiet_start, Profile.quiet_end: both set (a window, which may cross
 * midnight) or both null (none). The same start and end would be no window at all.
 */
export const saveQuietHoursSchema = z.union([
  z
    .object({ start: clockTime, end: clockTime })
    .refine((v) => v.start !== v.end, { error: 'quietSameTimes', path: ['end'] }),
  z.object({ start: z.null(), end: z.null() }),
])
export type SaveQuietHoursInput = z.infer<typeof saveQuietHoursSchema>

/** A student's own reminder: a daily time (data-model.md NotificationRule.trigger `daily` only). */
export const savePersonalReminderSchema = z.object({
  id: z.uuid().optional(),
  message: ruleMessage,
  time: clockTime,
  days: ruleDays,
  enabled: z.boolean(),
})
export type SavePersonalReminderInput = z.infer<typeof savePersonalReminderSchema>

export const deletePersonalReminderSchema = z.object({ id: z.uuid() })
