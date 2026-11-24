'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { syncNow } from '@/lib/offline/sync'
import { skipWaiting } from '@/lib/offline/worker-messages'

// "Update ready — Reload" (spec 008 US3; research R13; contracts/ui-routes.md › UpdateToast): a new
// worker waits until the student taps Reload, so nothing reloads mid-edit. Reload first lets the
// outbox finish (at most 5 s), then the new worker takes over and the page reloads once.

const FLUSH_MS = 5_000

async function reloadIntoUpdate() {
  await Promise.race([syncNow(), new Promise((resolve) => setTimeout(resolve, FLUSH_MS))])
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  })
  await skipWaiting()
}

export function UpdateToast() {
  const t = useTranslations('pwa.update')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let registration: ServiceWorkerRegistration | undefined
    const show = () =>
      toast(t('ready'), {
        id: 'update-ready', // once, however many times it's noticed
        duration: Infinity,
        action: { label: t('reload'), onClick: () => void reloadIntoUpdate() },
      })
    // Only an update: the very first install has no controller to replace.
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return
      const check = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) show()
      }
      check()
      worker.addEventListener('statechange', check)
    }
    void navigator.serviceWorker.ready.then((ready) => {
      registration = ready
      watch(ready.waiting)
      ready.addEventListener('updatefound', () => watch(ready.installing))
    })
    // A phone keeps the app open for days: look for a new version whenever it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [t])

  return null
}
