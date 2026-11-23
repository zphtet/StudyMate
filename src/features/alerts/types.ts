import type { MessageMode } from '@/generated/prisma/enums'
import type { RuleView } from '@/lib/notifications/rule-config'

// Shapes of the 006 Admin Route Handlers (contracts/route-handlers.md › Shared types, › Admin).

/** A chip on Alerts: one of the Admin's linked students. */
export type AlertStudent = { id: string; displayName: string; timezone: string }

/**
 * A recipient's state, from the `notifications` row (data-model.md › Derived values): `scheduled`
 * until delivered, also while a handed-over row is held because the student is busy.
 */
export type RecipientState = 'scheduled' | 'delivered' | 'read'

export type MessageView = {
  id: string
  body: string
  lesson: { id: string; title: string } | null
  mode: MessageMode
  urgent: boolean
  status: 'scheduled' | 'sent' | 'cancelled'
  recipients: {
    student: AlertStudent
    /** planned, ISO */
    deliverAt: string
    state: RecipientState
  }[]
}

/** The Alerts tab's messages (spec US3 scenario 6, Edge Cases). */
export type MessageLists = {
  /** status `scheduled`, soonest first */
  scheduled: MessageView[]
  /** sent or cancelled this week (the Admin's local Mon–Sun), newest first */
  recent: MessageView[]
  sentThisWeek: number
}

/** GET /api/alerts?student=<id|all> */
export type AlertsData = MessageLists & { students: AlertStudent[]; rules: RuleView[] }

/** GET /api/alerts/messages/[messageId] */
export type MessageData = { message: MessageView }

/** GET /api/alerts/availability: `sleep` covers sleep blocks and outside waking hours. */
export type Availability = {
  students: { id: string; state: 'free' | 'shift' | 'sleep' | 'quiet'; nextFree: string }[]
}

/** GET /api/alerts/rules/[ruleId] */
export type RuleData = { rule: RuleView }
