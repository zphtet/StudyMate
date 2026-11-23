// Spec 006 US1 scenarios 1–3; research R8; contracts/ui-routes.md › Turn on reminders.
import { describe, expect, test } from 'vitest'
import { deviceState, type DeviceFacts } from './device-state'

const android: DeviceFacts = {
  hasServiceWorker: true,
  hasPushManager: true,
  permission: 'default',
  isIos: false,
  isStandalone: false,
  isSubscribed: false,
}

describe('deviceState', () => {
  test('a browser that can push, not asked yet, is off', () => {
    expect(deviceState(android)).toBe('off')
  })

  test('subscribed with permission granted is on', () => {
    expect(deviceState({ ...android, permission: 'granted', isSubscribed: true })).toBe('on')
  })

  test('granted but not subscribed on this device is off (turned off, or another user signed out)', () => {
    expect(deviceState({ ...android, permission: 'granted' })).toBe('off')
  })

  test('denied permission is denied, even if a stale subscription exists', () => {
    expect(deviceState({ ...android, permission: 'denied' })).toBe('denied')
    expect(deviceState({ ...android, permission: 'denied', isSubscribed: true })).toBe('denied')
  })

  test('no service worker or push manager is unsupported', () => {
    expect(deviceState({ ...android, hasServiceWorker: false })).toBe('unsupported')
    expect(deviceState({ ...android, hasPushManager: false })).toBe('unsupported')
  })

  test('iPhone Safari outside the Home Screen app needs install (no PushManager there)', () => {
    const iphone = { ...android, isIos: true, hasPushManager: false }
    expect(deviceState(iphone)).toBe('needs-install')
  })

  test('the Home Screen app on iPhone can push like any browser', () => {
    expect(deviceState({ ...android, isIos: true, isStandalone: true })).toBe('off')
    expect(
      deviceState({
        ...android,
        isIos: true,
        isStandalone: true,
        permission: 'granted',
        isSubscribed: true,
      }),
    ).toBe('on')
  })

  test('iPad Safari in desktop mode counts as iOS (detected by the caller from touch points)', () => {
    expect(deviceState({ ...android, isIos: true, hasPushManager: false })).toBe('needs-install')
  })
})
