import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Label + control + error message, wired for screen readers (errors via aria-describedby).
export function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Shared look for text inputs on the phone screens (≥ 44 px tall, rounded like the screenshots). */
export const inputClass =
  'h-13 rounded-2xl bg-card px-4 text-base md:text-base dark:bg-card aria-invalid:ring-0'
