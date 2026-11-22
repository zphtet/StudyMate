import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminLessonReview, AdminStudentCard, AdminStudentDetail, LessonWork } from './types'

// TanStack Query keys for the 004 Route Handlers (contracts/route-handlers.md). Invalidation after
// writes and Realtime events follows contracts/server-actions.md › Query invalidation; the stories add
// their `queryOptions` next to these keys.

export const lessonWorkKeys = {
  /** The student's own work on one lesson: progress, submission, review comments, notes count. */
  work: (lessonId: string) => ['lesson', lessonId, 'work'] as const,
  /** One Notes thread; `studentId` is the thread owner (the student's own id for students). */
  notes: (lessonId: string, studentId: string) => ['lesson', lessonId, 'notes', studentId] as const,
}

export const focusKeys = {
  active: ['focus'] as const,
}

export const progressKeys = {
  all: ['progress'] as const,
  view: (view: 'month' | 'week') => ['progress', view] as const,
  summary: ['progress', 'summary'] as const,
}

export const adminProgressKeys = {
  all: ['admin', 'students'] as const,
  cards: ['admin', 'students', 'progress'] as const,
  student: (studentId: string) => ['admin', 'students', studentId] as const,
  lesson: (studentId: string, lessonId: string) =>
    ['admin', 'students', studentId, 'lessons', lessonId] as const,
}

export const lessonWorkQuery = (lessonId: string) =>
  queryOptions({
    queryKey: lessonWorkKeys.work(lessonId),
    queryFn: () => api<LessonWork>(`/api/lessons/${lessonId}/work`),
  })

export const studentCardsQuery = queryOptions({
  queryKey: adminProgressKeys.cards,
  queryFn: () => api<{ students: AdminStudentCard[] }>('/api/admin/students/progress'),
})

export const adminStudentQuery = (studentId: string) =>
  queryOptions({
    queryKey: adminProgressKeys.student(studentId),
    queryFn: () => api<AdminStudentDetail>(`/api/admin/students/${studentId}`),
  })

export const adminLessonReviewQuery = (studentId: string, lessonId: string) =>
  queryOptions({
    queryKey: adminProgressKeys.lesson(studentId, lessonId),
    queryFn: () => api<AdminLessonReview>(`/api/admin/students/${studentId}/lessons/${lessonId}`),
  })
