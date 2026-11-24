'use client'

import { useEffect } from 'react'
import { deleteOtherUsers } from '@/lib/offline/db'
import { startSync } from '@/lib/offline/sync'

// The device side of offline use that has no UI (spec 008 research R5, R10): once per signed-in
// user, remove any other user's offline data from this device; for a student, send the outbox
// whenever the app is open and online. Admins have nothing to queue (R14).
export function OfflineRuntime({ userId, role }: { userId: string; role: 'student' | 'admin' }) {
  useEffect(() => {
    let stop: (() => void) | undefined
    let isCancelled = false
    void deleteOtherUsers(userId).then(() => {
      if (!isCancelled && role === 'student') stop = startSync(userId)
    })
    return () => {
      isCancelled = true
      stop?.()
    }
  }, [userId, role])
  return null
}
