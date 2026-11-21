import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminCourseDetail, AdminCourseList, AdminLesson } from './types'

// TanStack Query options for the 002 Route Handlers (contracts/route-handlers.md › Query keys).

export const courseKeys = {
  admin: ['courses', 'admin'] as const,
  adminList: ['courses', 'admin', 'list'] as const,
  adminCourse: (courseId: string) => ['courses', 'admin', courseId] as const,
}

export const lessonKeys = {
  admin: (lessonId: string) => ['lessons', 'admin', lessonId] as const,
}

export const adminCoursesQuery = queryOptions({
  queryKey: courseKeys.adminList,
  queryFn: () => api<AdminCourseList>('/api/admin/courses'),
})

export const adminCourseQuery = (courseId: string) =>
  queryOptions({
    queryKey: courseKeys.adminCourse(courseId),
    queryFn: () => api<AdminCourseDetail>(`/api/admin/courses/${courseId}`),
  })

export const adminLessonQuery = (lessonId: string) =>
  queryOptions({
    queryKey: lessonKeys.admin(lessonId),
    queryFn: () => api<AdminLesson>(`/api/admin/lessons/${lessonId}`),
  })
