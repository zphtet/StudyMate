'use client'

import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { BellOff } from 'lucide-react'
import { useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/empty-state'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { markAllNotificationsRead, markNotificationRead } from '../actions'
import { inboxTime } from '../inbox-time'
import { inboxQuery, notificationKeys } from '../queries'
import type { InboxItem } from '../types'

// The inbox (contracts/ui-routes.md › Inbox; research R9): delivered items, newest first, 30 at a time,
// more on scroll. Tapping an item marks it read and opens its link (FR-007).

export function Inbox() {
  const t = useTranslations('inbox')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(inboxQuery)
  const items = data.pages.flatMap((page) => page.items)

  const markAll = useMutation({
    mutationFn: async () => unwrap(await markAllNotificationsRead({})),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })

  // Load the next page when the end of the list scrolls into view.
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = end.current
    if (!target || !hasNextPage) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (items.length === 0) {
    return (
      <EmptyState icon={BellOff} title={t('empty')}>
        {t('emptyBody')}
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.some((item) => !item.read) && (
        <Button
          variant="ghost"
          size="touch"
          className="self-end"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
        >
          {t('markAllRead')}
        </Button>
      )}
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((item) => (
          <InboxRow key={item.id} item={item} />
        ))}
      </ul>
      <div ref={end} aria-hidden className="h-1" />
      {isFetchingNextPage && (
        <p className="text-center text-sm text-muted-foreground">{t('loadingMore')}</p>
      )}
    </div>
  )
}

function InboxRow({ item }: { item: InboxItem }) {
  const t = useTranslations('inbox')
  const queryClient = useQueryClient()
  const f = useInstantFormat()
  const now = useNow({ updateInterval: 60_000 })
  const when = inboxTime(item.deliveredAt, now, f.viewerZone)

  const markRead = useMutation({
    mutationFn: async () => unwrap(await markNotificationRead({ id: item.id })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
  const open = () => {
    if (!item.read) markRead.mutate()
  }

  const content = (
    <>
      <span
        className={cn(
          'mt-2 size-2.5 shrink-0 rounded-full',
          item.read ? 'bg-transparent' : 'bg-primary',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('min-w-0 truncate', !item.read && 'font-semibold')}>
            {!item.read && <span className="sr-only">{t('unread')}: </span>}
            {item.title}
          </span>
          <time
            dateTime={item.deliveredAt}
            className="shrink-0 text-sm text-muted-foreground tabular-nums"
          >
            {when.kind === 'today'
              ? f.time(item.deliveredAt)
              : when.kind === 'yesterday'
                ? t('yesterday', { time: f.time(item.deliveredAt) })
                : f.day(item.deliveredAt)}
          </time>
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{item.body}</span>
      </span>
    </>
  )
  const className = 'flex w-full min-h-15 items-start gap-3 px-4 py-3 text-left hover:bg-muted/50'

  return (
    <li>
      {item.url ? (
        <Link href={item.url} onClick={open} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={open} className={className}>
          {content}
        </button>
      )}
    </li>
  )
}
