// Shapes of the 006 Route Handlers for everyone (contracts/route-handlers.md › Shared types).

/** A delivered notification in the inbox. */
export type InboxItem = {
  id: string
  title: string
  body: string
  url: string | null
  /** ISO */
  deliveredAt: string
  read: boolean
}

/** GET /api/notifications?cursor= */
export type InboxPage = { items: InboxItem[]; nextCursor: string | null }

/** GET /api/notifications/unread */
export type UnreadCount = { unread: number }
