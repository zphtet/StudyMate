import type { RuleView } from '@/lib/notifications/rule-config'

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

/** GET /api/me/reminders (US5): quiet hours, the student's own reminders, the Admin's rules. */
export type MyReminders = {
  quietHours: { start: string; end: string } | null
  /** students only; [] for Admins */
  personal: RuleView[]
  /** students: the active Admin's rules that reach them, read-only (FR-016); [] for Admins */
  fromAdmin: RuleView[]
}
