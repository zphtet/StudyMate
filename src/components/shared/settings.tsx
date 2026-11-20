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
  download,
  icon,
  label,
  value,
}: {
  href: string
  download?: boolean
  icon?: ReactNode
  label: string
  value?: ReactNode
}) {
  const content = (
    <>
      {icon && <span className="flex size-6 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-[1.0625rem]">{label}</span>
      {value && <span className="shrink-0 text-[0.9375rem] text-muted-foreground">{value}</span>}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </>
  )
  const className = 'flex min-h-15 items-center gap-3 px-4 py-3 hover:bg-muted/50'
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
