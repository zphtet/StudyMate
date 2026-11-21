import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminStudentCourse, AssignSheet, Clash, PlanWeek, StudentRef, Today } from './types'

// TanStack Query options for the 003 Route Handlers (contracts/route-handlers.md). Invalidation
// after writes follows contracts/server-actions.md › Query invalidation.

export const assignKeys = {
  sheet: (courseId: string) => ['assign', courseId] as const,
}

export const planKeys = {
  all: ['plan'] as const,
  student: (studentId: string) => ['plan', studentId] as const,
  weeks: (studentId: string) => ['plan', studentId, 'week'] as const,
  /** `week` null = the current week in the student's zone. */
  week: (studentId: string, week: string | null) => ['plan', studentId, 'week', week] as const,
}

export const adminStudentKeys = {
  list: ['admin-students'] as const,
  courses: (studentId: string) => ['admin-student-courses', studentId] as const,
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

/** Sheet data is fetched fresh when a sheet opens and never refetched while someone edits it. */
const sheetData = { staleTime: 0, refetchOnWindowFocus: false } as const

export const assignSheetQuery = (courseId: string) =>
  queryOptions({
    queryKey: assignKeys.sheet(courseId),
    queryFn: () => api<AssignSheet>(`/api/admin/courses/${courseId}/assign`),
    ...sheetData,
  })

export const linkedStudentsQuery = queryOptions({
  queryKey: adminStudentKeys.list,
  queryFn: () => api<StudentRef[]>('/api/admin/students'),
})

export const adminStudentCoursesQuery = (studentId: string) =>
  queryOptions({
    queryKey: adminStudentKeys.courses(studentId),
    queryFn: () => api<AdminStudentCourse[]>(`/api/admin/students/${studentId}/courses`),
    ...sheetData,
  })

export const planWeekQuery = (studentId: string, week: string | null) =>
  queryOptions({
    queryKey: planKeys.week(studentId, week),
    queryFn: () =>
      api<PlanWeek>(`/api/admin/plan?${new URLSearchParams({ studentId, ...(week && { week }) })}`),
  })
