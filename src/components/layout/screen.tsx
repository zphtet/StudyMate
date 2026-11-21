import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Full-screen page without the tab bar (course, lesson and editor screens; spec 002). */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-md px-5 pb-32', className)}>{children}</main>
}

/** Sticky action bar at the bottom of a full-screen form (≥ 44 px buttons, safe-area aware). */
export function BottomBar({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur',
        className,
      )}
    >
      <div className={cn('mx-auto flex w-full max-w-md items-center gap-3', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
