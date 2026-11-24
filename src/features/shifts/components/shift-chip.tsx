import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ChipPart } from '../calendar'
import type { ShiftType } from '../types'

// Shift colours (spec 005 research R5; --shift-* tokens in globals.css, checked for contrast). Off
// uses the muted pair.

export const SHIFT_COLOR: Record<ShiftType, string> = {
  day: 'bg-shift-day text-shift-day-foreground',
  evening: 'bg-shift-evening text-shift-evening-foreground',
  night: 'bg-shift-night text-shift-night-foreground',
  custom: 'bg-shift-custom text-shift-custom-foreground',
  off: 'bg-muted text-muted-foreground',
}

/**
 * A chip in a calendar day: "9–18", "22→" or "→07". Overnight halves are square where they meet and
 * reach the cell edge (the calendar's 2 px cell spacing is covered by the start half), so the two
 * read as one bar across the border and the row break (US1 scenario 3). Hidden from screen readers:
 * the day's name says the same in words.
 */
export function ShiftChip({
  type,
  part,
  children,
}: {
  type: ShiftType
  part: ChipPart
  children: ReactNode
}) {
  return (
    <span
      data-testid="shift-chip"
      data-part={part}
      aria-hidden
      className={cn(
        'block self-stretch truncate px-0.5 text-center text-[0.6875rem] leading-5 font-semibold tracking-tight tabular-nums',
        SHIFT_COLOR[type],
        part === 'whole' && 'mx-0.5 rounded-md',
        part === 'start' && '-mr-0.5 ml-0.5 rounded-l-md',
        part === 'end' && 'mr-0.5 rounded-r-md',
      )}
    >
      {children}
    </span>
  )
}

/** The small colour bar of a type (type tiles, legend). */
export function ShiftSwatch({ type, className }: { type: ShiftType; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2.5 w-6 rounded-full', SHIFT_COLOR[type], className)}
    />
  )
}
