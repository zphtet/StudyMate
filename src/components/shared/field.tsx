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

/**
 * A 28 px checkbox with an invisible 46 × 46 hit area (constitution V: tap targets ≥ 44 px). The
 * ::after box starts inside the 1 px border: 26 px + 2 × 10 px.
 */
export const checkboxClass =
  "relative size-7 rounded-md after:absolute after:-inset-2.5 after:content-['']"

/** A checkbox row's label that fills the row, so the whole row toggles the checkbox. */
export const checkboxLabelClass = 'min-h-11 flex-1 self-stretch text-base font-normal'
