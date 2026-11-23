import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { InboxPage, UnreadCount } from './types'

// TanStack Query keys for the 006 Route Handlers for everyone (contracts/route-handlers.md). Every key
// starts with 'notifications', so invalidating ['notifications'] refreshes the bell and the inbox
// (after a push arrives, an item is read, or the Sunday check is answered).

export const notificationKeys = {
  all: ['notifications'] as const,
  /** GET /api/notifications?cursor= */
  inbox: ['notifications', 'inbox'] as const,
  /** GET /api/notifications/unread */
  unread: ['notifications', 'unread'] as const,
}

export const inboxQuery = infiniteQueryOptions({
  queryKey: notificationKeys.inbox,
  queryFn: ({ pageParam }) =>
    api<InboxPage>(`/api/notifications${pageParam ? `?cursor=${pageParam}` : ''}`),
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.nextCursor,
})

/** The bell matters when the app is opened or a push arrives, so no polling (research R9). */
export const unreadQuery = queryOptions({
  queryKey: notificationKeys.unread,
  queryFn: () => api<UnreadCount>('/api/notifications/unread'),
  refetchOnWindowFocus: true,
})
