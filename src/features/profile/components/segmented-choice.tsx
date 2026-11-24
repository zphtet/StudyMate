'use client'

import { cn } from '@/lib/utils'

/**
 * A three-way control on a muted track (12-Appearance.png's Mode and Text size). A radiogroup:
 * each option is a radio with its label; `labelClassName` lets Text size draw each label at its own
 * size.
 */
export function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; labelClassName?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-muted p-1.5"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && onChange(option.value)}
            className={cn(
              'min-h-12 rounded-xl px-2 text-lg font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              option.labelClassName,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
