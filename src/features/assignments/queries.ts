import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Clash } from './types'

// TanStack Query options for the 003 Route Handlers (contracts/route-handlers.md). Invalidation
// after writes follows contracts/server-actions.md › Query invalidation.

export const assignKeys = {
  sheet: (courseId: string) => ['assign', courseId] as const,
}

export const planKeys = {
  all: ['plan'] as const,
}

export const todayKeys = {
  all: ['today'] as const,
}

export const clashKeys = {
  at: (studentId: string, at: string, minutes: number) =>
    ['clash', studentId, at, minutes] as const,
}

/** Shift/sleep clash for a picked deadline time (the caller debounces `at`). */
export const clashQuery = (studentId: string, at: string, minutes: number) =>
  queryOptions({
    queryKey: clashKeys.at(studentId, at, minutes),
    queryFn: () =>
      api<{ clash: Clash | null }>(
        `/api/admin/students/${studentId}/clash?${new URLSearchParams({ at, minutes: String(minutes) })}`,
      ),
  })
