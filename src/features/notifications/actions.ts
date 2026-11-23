'use server'

import { z } from 'zod'
import { action } from '@/lib/action'
import { requireUser } from '@/server/auth/guards'
import * as repo from './repo'
import {
  deletePushSubscriptionSchema,
  markNotificationReadSchema,
  savePushSubscriptionSchema,
} from './schemas'

// Spec 006 writes for every user (contracts/server-actions.md › Devices and inbox). Each starts with
// `requireUser()`; the user id always comes from the guard, never from the input.

/** Turn reminders on for this device (US1 scenario 1; research R8). */
export const savePushSubscription = action(savePushSubscriptionSchema, async (input) => {
  await repo.savePushSubscription((await requireUser()).id, input)
  return { on: true as const }
})

/** Turn reminders off for this device (FR-014). */
export const deletePushSubscription = action(deletePushSubscriptionSchema, async ({ endpoint }) => {
  await repo.deletePushSubscription((await requireUser()).id, endpoint)
  return { on: false as const }
})

/** An item opened from the inbox or a phone notification (FR-007). notification_not_found. */
export const markNotificationRead = action(markNotificationReadSchema, async ({ id }) =>
  repo.markRead((await requireUser()).id, id),
)

export const markAllNotificationsRead = action(z.object({}), async () =>
  repo.markAllRead((await requireUser()).id),
)
