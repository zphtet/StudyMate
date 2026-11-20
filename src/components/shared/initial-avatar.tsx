import { cn } from '@/lib/utils'

// FR-007 / clarification 5: the avatar is the display name's first letter on a tinted circle.
const TINTS = [
  'bg-tint-1 text-tint-1-foreground',
  'bg-tint-2 text-tint-2-foreground',
  'bg-tint-3 text-tint-3-foreground',
  'bg-tint-4 text-tint-4-foreground',
]

export function initialOf(name: string) {
  const first = Array.from(name.trim())[0] ?? '?'
  return first.toLocaleUpperCase()
}

function tintFor(seed: string) {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return TINTS[hash % TINTS.length]
}

export function InitialAvatar({
  name,
  seed,
  size = 'md',
  className,
}: {
  name: string
  /** Stable value (e.g. user id) so the colour doesn't change when the name does. */
  seed?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'sm' && 'size-9 text-sm',
        size === 'md' && 'size-11 text-lg',
        size === 'lg' && 'size-16 text-2xl',
        tintFor(seed ?? name),
        className,
      )}
    >
      {initialOf(name)}
    </span>
  )
}
