// Whether this device can get phone notifications, and whether it does (spec 006 US1 scenarios 1–3;
// research R8; contracts/ui-routes.md › Turn on reminders). Pure: the hook reads the browser's facts.

export type DeviceFacts = {
  hasServiceWorker: boolean
  hasPushManager: boolean
  permission: NotificationPermission
  /** iPhone, iPod or iPad, including iPad Safari in desktop mode */
  isIos: boolean
  /** opened from the Home Screen */
  isStandalone: boolean
  /** this browser holds a push subscription */
  isSubscribed: boolean
}

export type DeviceState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

export function deviceState(facts: DeviceFacts): DeviceState {
  // iOS shows notifications only for apps added to the Home Screen (iOS 16.4+; spec Assumptions).
  if (facts.isIos && !facts.isStandalone) return 'needs-install'
  if (!facts.hasServiceWorker || !facts.hasPushManager) return 'unsupported'
  if (facts.permission === 'denied') return 'denied'
  return facts.permission === 'granted' && facts.isSubscribed ? 'on' : 'off'
}

/** The VAPID public key as the bytes `pushManager.subscribe` takes (base64url → Uint8Array). */
export function applicationServerKey(base64Url: string) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}
