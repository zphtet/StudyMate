'use client'

import { fonts, type FontId } from '@/lib/appearance'
import { cn } from '@/lib/utils'

/**
 * Font (12-Appearance.png; contracts/ui-routes.md; research R6): 10 tiles in two columns, each
 * with "Aa" and the name written in that font. Setting the family here downloads that font's
 * Latin subset on this screen only (FR-007). Names are never translated (FR-013).
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
            onClick={() => !active && onChange(id)}
            style={{ fontFamily: `var(--font-${id})` }}
            className={cn(
              'flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left transition-colors',
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
