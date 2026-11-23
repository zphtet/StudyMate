'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  currentPushSubscription,
  SERVICE_WORKER_URL,
  unsubscribeThisDevice,
} from '@/lib/push-device'
import { unwrap } from '@/lib/result'
import { deletePushSubscription, savePushSubscription } from './actions'
import { applicationServerKey, deviceState, type DeviceState } from './device-state'
import { notificationKeys } from './queries'

// Reminders on this device (spec 006 FR-014; research R8): what the browser allows, turning push on
// (permission, service worker, subscription, then the server row) and off. The "Turn on reminders"
// card and the Me row use it.

const DISMISSED_KEY = 'studymate.remindersCardDismissed'

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPad Safari in desktop mode reports a Mac with touch.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && navigator.standalone === true)

async function readState(): Promise<DeviceState> {
  const hasServiceWorker = 'serviceWorker' in navigator
  const hasPushManager = 'PushManager' in window
  return deviceState({
    hasServiceWorker,
    hasPushManager,
    permission: 'Notification' in window ? Notification.permission : 'default',
    isIos: isIos(),
    isStandalone: isStandalone(),
    isSubscribed: hasServiceWorker && hasPushManager && (await currentPushSubscription()) !== null,
  })
}

// The card's "Not now" is a per-device convenience in localStorage. Until the browser has been read
// (server render), the card counts as dismissed, so it never flashes.
const dismissListeners = new Set<() => void>()
const subscribeDismissed = (listener: () => void) => {
  dismissListeners.add(listener)
  return () => {
    dismissListeners.delete(listener)
  }
}

/** Also kept in memory, so "Not now" works for this visit when storage is blocked. */
let isDismissedThisVisit = false

function readDismissed() {
  try {
    return isDismissedThisVisit || localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return isDismissedThisVisit
  }
}

export function useDeviceReminders() {
  const queryClient = useQueryClient()
  /** null until the browser has been asked (first render on the server and client). */
  const [state, setState] = useState<DeviceState | null>(null)
  const isDismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true)

  const refresh = useCallback(() => readState().then(setState), [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const turnOn = useMutation({
    mutationFn: async () => {
      // Ask first, inside the tap: Safari only shows the prompt for a user gesture.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      await navigator.serviceWorker.register(SERVICE_WORKER_URL)
      const registration = await navigator.serviceWorker.ready
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(key),
      })
      const { endpoint, keys } = subscription.toJSON()
      unwrap(
        await savePushSubscription({
          endpoint,
          keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' },
        }),
      )
    },
    onSettled: refresh,
  })

  const turnOff = useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribeThisDevice()
      if (endpoint) unwrap(await deletePushSubscription({ endpoint }))
    },
    onSettled: async () => {
      await refresh()
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })

  const dismiss = () => {
    isDismissedThisVisit = true
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Private mode or blocked storage: the card shows again on the next visit.
    }
    dismissListeners.forEach((listener) => listener())
  }

  return { state, turnOn, turnOff, isDismissed, dismiss }
}
