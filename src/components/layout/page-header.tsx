import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 pt-6 pb-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
