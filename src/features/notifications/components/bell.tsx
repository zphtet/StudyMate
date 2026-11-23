'use client'

import { useQuery } from '@tanstack/react-query'
import { Bell as BellIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { unreadQuery } from '../queries'

// The bell (screen 04-Today, 16-AdminStudents; contracts/ui-routes.md › Bell): a 48 px round button
// with a dot and the unread count, opening the inbox. Its label says the count (constitution V).

export function Bell({ href }: { href: '/s/inbox' | '/a/inbox' }) {
  const t = useTranslations('bell')
  const { data } = useQuery(unreadQuery)
  const unread = data?.unread ?? 0
  return (
    <Link
      href={href}
      aria-label={t('label', { count: unread })}
      className="relative flex size-12 shrink-0 items-center justify-center rounded-full border bg-card hover:bg-muted"
    >
      <BellIcon className="size-6" aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-background"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}
