'use client'

// This browser's push subscription (spec 006 research R8). The notifications feature turns it on and
// off; sign-out on Me removes it too, so the next person who signs in on this device starts with
// reminders off (FR-014). Shared, so it lives here.

/** The service worker that shows pushes (public/sw.js; 008 replaces it). */
export const SERVICE_WORKER_URL = '/sw.js'

/** This browser's push subscription, if it has one. */
export async function currentPushSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL)
  return (await registration?.pushManager?.getSubscription()) ?? null
}

/** Unsubscribes this browser and returns the endpoint it had, for the server to forget. */
export async function unsubscribeThisDevice() {
  const subscription = await currentPushSubscription()
  if (!subscription) return null
  const { endpoint } = subscription
  await subscription.unsubscribe()
  return endpoint
}
