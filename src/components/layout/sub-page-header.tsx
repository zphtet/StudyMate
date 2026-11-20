import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

/** Back chevron + title for screens below a tab (Appearance, Account and password). */
export function SubPageHeader({
  title,
  backHref,
  backLabel,
}: {
  title: string
  backHref: string
  backLabel: string
}) {
  return (
    <header className="flex items-center gap-2 pt-5 pb-5">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
      >
        <ChevronLeft className="size-6" aria-hidden />
      </Link>
      <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
    </header>
  )
}
