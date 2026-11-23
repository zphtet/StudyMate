import type { RuleView } from '@/lib/notifications/rule-config'

// Shapes of the 006 Admin Route Handlers (contracts/route-handlers.md › Admin). Scheduled messages,
// the week's sent ones and the count arrive with US3.

/** A chip on Alerts: one of the Admin's linked students. */
export type AlertStudent = { id: string; displayName: string; timezone: string }

/** GET /api/alerts?student=<id|all> */
export type AlertsData = { students: AlertStudent[]; rules: RuleView[] }

/** GET /api/alerts/rules/[ruleId] */
export type RuleData = { rule: RuleView }
