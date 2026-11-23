import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AlertsData, Availability, MessageData, RuleData } from './types'

// TanStack Query keys for the 006 Admin Route Handlers (contracts/route-handlers.md › Admin). Every key
// starts with 'alerts', so invalidating ['alerts'] refreshes the list and the editor after a change.

/** A student's id, or 'all' for All students. */
export type AlertsScope = string

export const alertKeys = {
  all: ['alerts'] as const,
  /** GET /api/alerts?student= */
  list: (student: AlertsScope) => ['alerts', student] as const,
  /** GET /api/alerts/rules/[ruleId] */
  rule: (id: string) => ['alerts', 'rule', id] as const,
  /** GET /api/alerts/messages/[messageId] */
  message: (id: string) => ['alerts', 'message', id] as const,
  /** GET /api/alerts/availability */
  availability: (studentIds: string[], at: string) =>
    ['alerts', 'availability', [...studentIds].sort().join(','), at] as const,
}

export const alertsQuery = (student: AlertsScope) =>
  queryOptions({
    queryKey: alertKeys.list(student),
    queryFn: () => api<AlertsData>(`/api/alerts?student=${encodeURIComponent(student)}`),
  })

export const ruleQuery = (id: string) =>
  queryOptions({
    queryKey: alertKeys.rule(id),
    queryFn: () => api<RuleData>(`/api/alerts/rules/${id}`),
  })

export const messageQuery = (id: string) =>
  queryOptions({
    queryKey: alertKeys.message(id),
    queryFn: () => api<MessageData>(`/api/alerts/messages/${id}`),
  })

/** Free, shift, sleep or quiet at `at` for each student, and their next free moment (US3 scenario 4). */
export const availabilityQuery = (studentIds: string[], at: string) =>
  queryOptions({
    queryKey: alertKeys.availability(studentIds, at),
    queryFn: () =>
      api<Availability>(
        `/api/alerts/availability?students=${studentIds.join(',')}&at=${encodeURIComponent(at)}`,
      ),
    staleTime: 60_000,
  })
