import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AssignSheet, Clash, Today } from './types'

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

/** The student's Today lists; refetched on mount and focus like 002's student queries. */
export const todayQuery = queryOptions({
  queryKey: todayKeys.all,
  queryFn: () => api<Today>('/api/today'),
})

/** The Assign sheet; always fresh when the sheet opens. */
export const assignSheetQuery = (courseId: string) =>
  queryOptions({
    queryKey: assignKeys.sheet(courseId),
    queryFn: () => api<AssignSheet>(`/api/admin/courses/${courseId}/assign`),
    staleTime: 0,
  })
