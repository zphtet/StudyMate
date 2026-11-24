'use client'

import { useEffect } from 'react'
import { keepUrls } from '@/lib/offline/worker-messages'
import { isLocalShift } from './offline'
import type { ShiftView } from './types'

/** Pages are small; more than this in one month isn't a realistic student schedule. */
const MAX_PAGES = 40

/**
 * Spec 008 FR-003 (shift edits offline): opening Shifts online stores the Add shift page and the
 * month's shift pages with the service worker, so they open offline (research R2, R3). At idle and
 * one at a time, so it never competes with the screen itself.
 */
export function useKeepShiftPages(shifts: ShiftView[]) {
  const urls = [
    '/s/shifts/new',
    ...shifts.filter((s) => !isLocalShift(s.id)).map((s) => `/s/shifts/${s.id}`),
  ].slice(0, MAX_PAGES)
  const key = urls.join(' ')
  useEffect(() => {
    if (!navigator.onLine) return
    const handle = requestIdleCallback(() => void keepUrls(key.split(' ')))
    return () => cancelIdleCallback(handle)
  }, [key])
}
