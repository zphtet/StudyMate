import { Check } from 'lucide-react'

/** StudyMate mark: a check on the primary colour (screenshots 01, 15). */
export function AppMark() {
  return (
    <span
      aria-hidden
      className="flex size-12 items-center justify-center rounded-[0.9rem] bg-primary text-primary-foreground"
    >
      <Check className="size-6" strokeWidth={3} />
    </span>
  )
}
