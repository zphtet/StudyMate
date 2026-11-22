import { cn } from '@/lib/utils'

// Spec 004 contracts/ui-routes.md › Shared components: course progress on Courses, the course
// screen, Progress, Today and the Admin cards. `percent` null = no published lessons ("—", spec Edge
// Cases). The fill colour is a theme-token class (default primary; a course passes its own, e.g.
// COURSE_COLOR_CLASSES[color].solid), never a hex value (constitution V).
export function ProgressBar({
  percent,
  label,
  fillClassName = 'bg-primary',
  className,
}: {
  percent: number | null
  /** Accessible name, usually the course title. */
  label: string
  fillClassName?: string
  className?: string
}) {
  const value = percent === null ? null : Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? '—' : undefined}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full', fillClassName)}
        style={{ width: `${value ?? 0}%` }}
      />
    </div>
  )
}
