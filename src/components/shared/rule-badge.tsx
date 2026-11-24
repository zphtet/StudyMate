import type { RuleBadge as Badge } from '@/lib/notifications/rule-summary'
import { cn } from '@/lib/utils'

// A rule's type badge (spec 006, 24-AdminNotify.png): DAY, DUE, LATE… on Alerts and My reminders.

/** Theme tokens only (constitution V), one tone per trigger as in the screenshot. */
const TONES: Record<Badge, string> = {
  DAY: 'bg-course-indigo-soft text-course-indigo',
  SHIFT: 'bg-course-berry-soft text-course-berry',
  DUE: 'bg-warning text-warning-foreground',
  LATE: 'bg-destructive-soft text-destructive',
  FIRE: 'bg-course-rust-soft text-course-rust',
  IDLE: 'bg-muted text-muted-foreground',
  WEEK: 'bg-success-soft text-success',
}

export function RuleBadge({ badge, label }: { badge: Badge; label: string }) {
  return (
    <span
      className={cn(
        // 36 px as in 24-AdminNotify.png; the row around it is the 44 px tap target.
        'flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold',
        TONES[badge],
      )}
    >
      {label}
    </span>
  )
}
