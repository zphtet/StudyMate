import 'server-only'
import { sendNotification, WebPushError } from 'web-push'

// Web Push to one device (spec 006 research R5, R6; data-model.md PushSubscription). The dispatcher
// and "Send test" send through a PushSender, so tests swap in a recorder (tests/utils/push-recorder.ts).

/** One device: a push_subscriptions row. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string }

/** What the service worker (src/app/sw.ts) shows. `tag` makes the phone replace, not stack, a repeated notification. */
export type PushPayload = { title: string; body: string; url: string; tag: string }

/**
 * `gone`: the push service answered 404 or 410, so the device unsubscribed or expired and its row
 * is deleted (Edge Cases). `failed`: anything else; the inbox still has the item (R6).
 */
export type PushResult = 'ok' | 'gone' | 'failed'

export type PushSender = { send(target: PushTarget, payload: PushPayload): Promise<PushResult> }

/** Push services keep a message for an offline device this long (R5). */
const TTL_SECONDS = 24 * 60 * 60

/** VAPID keys from the environment (technical-spec §9). Missing keys are a deployment error. */
function vapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      'Web Push needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT',
    )
  }
  return { subject, publicKey, privateKey }
}

export const webPushSender: PushSender = {
  async send({ endpoint, p256dh, auth }, payload) {
    const options = { TTL: TTL_SECONDS, vapidDetails: vapidDetails() }
    try {
      await sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(payload), options)
      return 'ok'
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        return 'gone'
      }
      // One try per device (R6): the item is in the inbox, and push services retry on their own.
      console.warn('[push] send failed', error instanceof WebPushError ? error.statusCode : error)
      return 'failed'
    }
  },
}
