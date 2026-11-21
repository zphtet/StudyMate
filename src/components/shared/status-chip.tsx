import { cn } from '@/lib/utils'

// Small status label (Published / Draft / Active / Archived / Locked). Theme tokens only.
const TONES = {
  success: 'bg-success-soft text-success',
  muted: 'bg-muted text-muted-foreground',
  accent: 'bg-accent text-accent-foreground',
} as const

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONES
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-sm leading-none font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
