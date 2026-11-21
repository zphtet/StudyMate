import type { ReactNode } from 'react'

/** The round ‹ / › buttons beside the Plan's week and month headings (44 px). */
export function NavButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
    >
      {children}
    </button>
  )
}
