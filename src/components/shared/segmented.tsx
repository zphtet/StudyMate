'use client'

import { cn } from '@/lib/utils'

// Segmented control built from real radio inputs (keyboard arrows, screen readers and tests all see
// a radio group). The transparent input covers its segment so the whole segment is the tap target.
export function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  className,
}: {
  name: string
  legend: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-muted p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'relative flex min-h-12 items-center justify-center rounded-xl px-3 text-center font-medium text-muted-foreground transition-colors',
              'has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm',
              'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="absolute inset-0 size-full cursor-pointer appearance-none rounded-xl outline-none"
            />
            <span className="pointer-events-none relative">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
