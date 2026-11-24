// When to offer "Install StudyMate" (spec 008 US1 scenarios 1–2; research R12). Pure rules plus thin
// wrappers over data-model.md › Browser storage installVisits, installDismissedUntil and
// installVisitCounted. Every storage access may throw (private mode, blocked site data); then the
// prompt simply isn't offered.

const VISITS_KEY = 'installVisits'
const DISMISSED_KEY = 'installDismissedUntil'
const COUNTED_KEY = 'installVisitCounted'

/** Not now hides the prompt for this long (spec US1 scenario 1). */
export const INSTALL_DISMISS_DAYS = 14
const DAY_MS = 86_400_000

/** `prompt`: the browser's own install dialog (Chromium). `ios`: Safari's Add to Home Screen steps. */
export type InstallPlatform = 'prompt' | 'ios' | 'none'

export type InstallState = { visits: number; dismissedUntil: number }

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value)
    return true
  } catch {
    return false
  }
}

const local = () => localStorage
const session = () => sessionStorage

/** A visit is an app open in a new browser session; each is counted once (research R12). */
export function countVisit() {
  if (read(session, COUNTED_KEY) === '1') return
  if (!write(session, COUNTED_KEY, '1')) return
  const visits = Number(read(local, VISITS_KEY)) || 0
  write(local, VISITS_KEY, String(visits + 1))
}

export function readInstallState(): InstallState {
  return {
    visits: Number(read(local, VISITS_KEY)) || 0,
    dismissedUntil: Number(read(local, DISMISSED_KEY)) || 0,
  }
}

export function dismissInstall(now: number) {
  write(local, DISMISSED_KEY, String(now + INSTALL_DISMISS_DAYS * DAY_MS))
}

export function shouldOffer({
  visits,
  dismissedUntil,
  now,
  isStandalone,
  platform,
}: InstallState & { now: number; isStandalone: boolean; platform: InstallPlatform }) {
  return !isStandalone && platform !== 'none' && visits >= 2 && now >= dismissedUntil
}

export function detectPlatform({
  userAgent,
  maxTouchPoints,
  hasPromptEvent,
}: {
  userAgent: string
  maxTouchPoints: number
  hasPromptEvent: boolean
}): InstallPlatform {
  if (hasPromptEvent) return 'prompt'
  // iPad Safari in desktop mode reports a Mac with touch.
  const isIosDevice =
    /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  // Only Safari: Chrome, Firefox and Edge on iOS name themselves (research R12).
  const isSafari = /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  return isIosDevice && isSafari ? 'ios' : 'none'
}

/** The app was opened from the Home Screen or as an installed window. */
export function isStandaloneDisplay() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}
