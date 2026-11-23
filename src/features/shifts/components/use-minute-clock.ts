'use client'

import { useEffect, useState } from 'react'

/**
 * The device's clock, a minute at a time (the Sunday check appears at 18:00; Today's banner counts
 * the free minutes). Null until mounted, so the server's render and the first browser render agree
 * whatever each clock says.
 */
export function useMinuteClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
