import { cn } from '@/lib/utils'
import type { CourseColor } from '../schemas'

// Course tile (data-model.md Course.icon / Course.color, research.md R11). Literal class names so
// Tailwind generates them; colours are theme tokens checked by theme-contrast.test.ts.
export const COURSE_COLOR_CLASSES: Record<CourseColor, { tile: string; solid: string }> = {
  indigo: { tile: 'bg-course-indigo-soft text-course-indigo', solid: 'bg-course-indigo' },
  teal: { tile: 'bg-course-teal-soft text-course-teal', solid: 'bg-course-teal' },
  rust: { tile: 'bg-course-rust-soft text-course-rust', solid: 'bg-course-rust' },
  berry: { tile: 'bg-course-berry-soft text-course-berry', solid: 'bg-course-berry' },
  green: { tile: 'bg-course-green-soft text-course-green', solid: 'bg-course-green' },
  slate: { tile: 'bg-course-slate-soft text-course-slate', solid: 'bg-course-slate' },
}

const SIZES = {
  sm: 'size-11 rounded-xl text-xl',
  md: 'size-14 rounded-2xl text-2xl',
  lg: 'size-20 rounded-3xl text-4xl',
} as const

export function CourseIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: string
  color: CourseColor
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center leading-none select-none',
        SIZES[size],
        COURSE_COLOR_CLASSES[color].tile,
        className,
      )}
    >
      {icon}
    </span>
  )
}
