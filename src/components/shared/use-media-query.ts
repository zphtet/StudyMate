'use client'

import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches. The server (and environments without matchMedia) say no. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
