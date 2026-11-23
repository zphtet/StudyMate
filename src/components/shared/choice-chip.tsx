import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Spec 006: the rule editor's trigger and day chips, and the days of a personal reminder.

/** A chip that is a real radio or checkbox covering the whole chip (≥ 44 px; like Segmented). */
export function ChoiceChip({
  type,
  name,
  checked,
  onChange,
  children,
}: {
  type: 'radio' | 'checkbox'
  name?: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        'relative flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-card px-4 font-medium transition-colors',
        'has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground',
        'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full outline-none"
      />
      <span className="pointer-events-none relative">{children}</span>
    </label>
  )
}
