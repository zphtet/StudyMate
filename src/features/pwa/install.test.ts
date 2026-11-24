import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countVisit,
  detectPlatform,
  dismissInstall,
  INSTALL_DISMISS_DAYS,
  readInstallState,
  shouldOffer,
} from './install'

// Spec 008 US1 scenarios 1–2; research R12; data-model.md › Browser storage installVisits,
// installDismissedUntil, installVisitCounted.

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 24, 9)

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const FIREFOX_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:132.0) Gecko/20100101 Firefox/132.0'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('countVisit', () => {
  it('counts each browser session once', () => {
    countVisit()
    countVisit()
    expect(readInstallState().visits).toBe(1)
    sessionStorage.clear() // a new session
    countVisit()
    expect(readInstallState().visits).toBe(2)
  })
})

describe('shouldOffer', () => {
  const base = {
    visits: 2,
    dismissedUntil: 0,
    now: NOW,
    isStandalone: false,
    platform: 'prompt' as const,
  }

  it('waits for the second visit', () => {
    expect(shouldOffer({ ...base, visits: 1 })).toBe(false)
    expect(shouldOffer(base)).toBe(true)
  })

  it('stays hidden until the dismissal ends, then comes back', () => {
    expect(shouldOffer({ ...base, dismissedUntil: NOW + DAY })).toBe(false)
    expect(shouldOffer({ ...base, dismissedUntil: NOW - 1 })).toBe(true)
  })

  it('never shows in the installed app or where neither path applies', () => {
    expect(shouldOffer({ ...base, isStandalone: true })).toBe(false)
    expect(shouldOffer({ ...base, platform: 'none' })).toBe(false)
    expect(shouldOffer({ ...base, platform: 'ios' })).toBe(true)
  })
})

describe('dismissInstall', () => {
  it(`hides the prompt for ${INSTALL_DISMISS_DAYS} days`, () => {
    dismissInstall(NOW)
    expect(readInstallState().dismissedUntil).toBe(NOW + 14 * DAY)
  })
})

describe('detectPlatform', () => {
  it('uses the browser prompt whenever the browser offered one', () => {
    expect(
      detectPlatform({ userAgent: ANDROID_CHROME, maxTouchPoints: 5, hasPromptEvent: true }),
    ).toBe('prompt')
  })

  it('shows the steps in Safari on iPhone and on iPad in desktop mode', () => {
    expect(
      detectPlatform({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, hasPromptEvent: false }),
    ).toBe('ios')
    expect(
      detectPlatform({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5, hasPromptEvent: false }),
    ).toBe('ios')
  })

  it('offers nothing in other browsers without a prompt', () => {
    expect(
      detectPlatform({ userAgent: IPHONE_CHROME, maxTouchPoints: 5, hasPromptEvent: false }),
    ).toBe('none')
    expect(
      detectPlatform({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0, hasPromptEvent: false }),
    ).toBe('none')
    expect(
      detectPlatform({ userAgent: FIREFOX_DESKTOP, maxTouchPoints: 0, hasPromptEvent: false }),
    ).toBe('none')
    expect(
      detectPlatform({ userAgent: ANDROID_CHROME, maxTouchPoints: 5, hasPromptEvent: false }),
    ).toBe('none')
  })
})

describe('when storage is blocked', () => {
  it('offers nothing and throws nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => countVisit()).not.toThrow()
    expect(() => dismissInstall(NOW)).not.toThrow()
    const state = readInstallState()
    expect(shouldOffer({ ...state, now: NOW, isStandalone: false, platform: 'prompt' })).toBe(false)
  })
})
