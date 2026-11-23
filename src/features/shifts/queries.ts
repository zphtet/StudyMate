import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MonthShifts, ShiftSettingsResponse, ShiftsToday, ShiftView } from './types'

// TanStack Query keys for the 005 Route Handlers (contracts/route-handlers.md). Every key starts with
// 'shifts', so invalidating ['shifts'] refreshes the month, detail, settings and Today banner
// (contracts/server-actions.md › Query invalidation). The stories add their `queryOptions` here.

export const shiftKeys = {
  all: ['shifts'] as const,
  /** GET /api/shifts?month=YYYY-MM */
  month: (month: string) => ['shifts', 'month', month] as const,
  /** GET /api/shifts/[shiftId] */
  detail: (shiftId: string) => ['shifts', 'detail', shiftId] as const,
  /** GET /api/shifts/settings */
  settings: ['shifts', 'settings'] as const,
  /** GET /api/shifts/today: the Today banner, the Sunday check and the Me row */
  today: ['shifts', 'today'] as const,
}

export const monthShiftsQuery = (month: string) =>
  queryOptions({
    queryKey: shiftKeys.month(month),
    queryFn: () => api<MonthShifts>(`/api/shifts?month=${month}`),
  })

export const shiftQuery = (shiftId: string) =>
  queryOptions({
    queryKey: shiftKeys.detail(shiftId),
    queryFn: () => api<{ shift: ShiftView }>(`/api/shifts/${shiftId}`),
  })

export const shiftSettingsQuery = queryOptions({
  queryKey: shiftKeys.settings,
  queryFn: () => api<ShiftSettingsResponse>('/api/shifts/settings'),
})

export const shiftsTodayQuery = queryOptions({
  queryKey: shiftKeys.today,
  queryFn: () => api<ShiftsToday>('/api/shifts/today'),
})
