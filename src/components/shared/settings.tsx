import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

// Grouped rows like iOS settings (screen 11-Profile): section label + rounded card of rows.

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y overflow-hidden rounded-2xl border bg-card">{children}</div>
}

export function SettingsRow({
  href,
  onClick,
  download,
  icon,
  label,
  value,
  disabled,
  describedBy,
}: {
  /** A link row, or with `onClick` a button row (e.g. one that opens a sheet). */
  href?: string
  onClick?: () => void
  download?: boolean
  /** Button rows only, e.g. a write that needs a connection (spec 008 R14). */
  disabled?: boolean
  describedBy?: string
  icon?: ReactNode
  label: string
  value?: ReactNode
}) {
  const content = (
    <>
      {icon && <span className="flex size-6 shrink-0 items-center justify-center">{icon}</span>}
      {/*
        The value starts from nothing (flex-basis 0) and fills what the label leaves, but never less
        than 5.5rem, so short values ("Blocked", "5 days", "3 on") stay whole. The label keeps its
        full width whenever it fits next to that, and truncates only when it doesn't. So a long value
        ("While on shift + sleep", a 28-day rotation) never cuts "Quiet hours" short.
      */}
      <span className="min-w-0 truncate text-[1.0625rem]">{label}</span>
      {value ? (
        <span className="min-w-22 flex-1 truncate text-right text-[0.9375rem] text-muted-foreground">
          {value}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </>
  )
  const className = 'flex min-h-15 items-center gap-3 px-4 py-3 hover:bg-muted/50'
  if (!href) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-describedby={describedBy}
        className={`${className} w-full text-left disabled:opacity-50`}
      >
        {content}
      </button>
    )
  }
  // Downloads must be a plain link so the browser saves the file.
  return download ? (
    <a href={href} download className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}
