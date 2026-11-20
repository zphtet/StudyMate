import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

// Frame for the signed-out screens (sign in, sign up, confirm, reset, join): phone-width column,
// optional back link on the left, language menu on the right.
export function AuthShell({
  backHref,
  backLabel,
  showLanguage = true,
  children,
}: {
  backHref?: string
  backLabel?: string
  showLanguage?: boolean
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="flex min-h-14 items-center justify-between">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
        ) : (
          <span />
        )}
        {showLanguage && <LanguageSwitcher />}
      </div>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
