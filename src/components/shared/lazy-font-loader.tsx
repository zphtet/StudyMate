'use client'

import { useEffect } from 'react'
import { loadLazyFont } from '@/lib/lazy-fonts'

/**
 * Spec 007 (T039): loads M PLUS Rounded 1c or Zen Maru Gothic when <html data-font> names one,
 * whoever set it: the pre-paint script, a choice on Appearance, AppearanceSync or sign-in.
 */
export function LazyFontLoader() {
  useEffect(() => {
    const html = document.documentElement
    const load = () => void loadLazyFont(html.dataset.font)
    load()
    const observer = new MutationObserver(load)
    observer.observe(html, { attributes: true, attributeFilter: ['data-font'] })
    return () => observer.disconnect()
  }, [])
  return null
}
