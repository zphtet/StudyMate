import { z } from 'zod'

// Spec 006 contracts/server-actions.md › Devices and inbox. Shared by the client and the actions.

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
