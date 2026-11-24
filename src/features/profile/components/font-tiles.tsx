'use client'

import { useEffect, useState } from 'react'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { fonts, type FontId } from '@/lib/appearance'
import { loadAllLazyFonts } from '@/lib/lazy-fonts'
import { cn } from '@/lib/utils'

/**
 * Font (12-Appearance.png; contracts/ui-routes.md; research R6): 10 tiles in two columns, each
 * with "Aa" and the name written in that font, which downloads that font's Latin subset on this
 * screen only (FR-007), plus the two on-demand Japanese fonts. Names are never translated (FR-013).
 */
export function FontTiles({
  label,
  value,
  onChange,
}: {
  label: string
  value: FontId
  onChange: (id: FontId) => void
}) {
  const showFaces = useWhenIdle()
  // Each choice saves itself, which needs the server (spec 008 R14).
  const connection = useNeedsConnection()
  useEffect(() => {
    if (showFaces) void loadAllLazyFonts()
  }, [showFaces])
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3">
      {fonts.map(({ id, name }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={connection.disabled}
            aria-describedby={connection.describedBy}
            onClick={() => !active && onChange(id)}
            style={showFaces ? { fontFamily: `var(--font-${id})` } : undefined}
            className={cn(
              'flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left transition-colors disabled:opacity-50',
              active ? 'border-primary bg-accent' : 'border-border bg-card hover:border-input',
            )}
          >
            <span className="shrink-0 text-xl font-semibold" aria-hidden>
              Aa
            </span>
            {/* Latin names in any UI language: sized so the longest single word (Merriweather) fits
                at Default; at Large it hyphenates where the browser can, else breaks, never overflows. */}
            <span
              lang="en"
              className="min-w-0 text-[0.9375rem] leading-tight [overflow-wrap:anywhere] hyphens-auto"
            >
              {name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * True once the browser is idle after the first paint (T039). The ten tiles' fonts, ~760 KB of
 * CSS and files, otherwise compete with the preview card's own text, which held Appearance's
 * largest paint back by about 6 s on a throttled phone. The tiles sit below the fold at 390 px,
 * so their names swap in off-screen.
 */
function useWhenIdle() {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const done = () => setIdle(true)
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(done, { timeout: 2000 })
      return () => cancelIdleCallback(id)
    }
    const timer = setTimeout(done, 1000)
    return () => clearTimeout(timer)
  }, [])
  return idle
}
