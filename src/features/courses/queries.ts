import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AdminCourseDetail,
  AdminCourseList,
  AdminLesson,
  LessonImpact,
  RecentlyDeleted,
  StudentCourse,
  StudentCourseList,
  StudentLesson,
} from './types'

// TanStack Query options for the 002 Route Handlers (contracts/route-handlers.md › Query keys).

export const courseKeys = {
  admin: ['courses', 'admin'] as const,
  adminList: ['courses', 'admin', 'list'] as const,
  deleted: ['courses', 'admin', 'deleted'] as const,
  adminCourse: (courseId: string) => ['courses', 'admin', courseId] as const,
}

export const lessonKeys = {
  admin: (lessonId: string) => ['lessons', 'admin', lessonId] as const,
  impact: (lessonId: string) => ['lessons', 'admin', lessonId, 'impact'] as const,
  student: (lessonId: string) => ['lessons', 'student', lessonId] as const,
}

export const studentCourseKeys = {
  list: ['courses', 'student', 'list'] as const,
  course: (courseId: string) => ['courses', 'student', courseId] as const,
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

/** Who would lose work if the lesson were deleted; always fresh when the sheet opens. */
export const lessonImpactQuery = (lessonId: string) =>
  queryOptions({
    queryKey: lessonKeys.impact(lessonId),
    queryFn: () => api<LessonImpact>(`/api/admin/lessons/${lessonId}/impact`),
    staleTime: 0,
  })

export const recentlyDeletedQuery = queryOptions({
  queryKey: courseKeys.deleted,
  queryFn: () => api<RecentlyDeleted>('/api/admin/courses/deleted'),
})

// ── Student ─────────────────────────────────────────────────────────────────────────────────

export const studentCoursesQuery = queryOptions({
  queryKey: studentCourseKeys.list,
  queryFn: () => api<StudentCourseList>('/api/courses'),
})

export const studentCourseQuery = (courseId: string) =>
  queryOptions({
    queryKey: studentCourseKeys.course(courseId),
    queryFn: () => api<StudentCourse>(`/api/courses/${courseId}`),
  })

export const studentLessonQuery = (lessonId: string) =>
  queryOptions({
    queryKey: lessonKeys.student(lessonId),
    queryFn: () => api<StudentLesson>(`/api/lessons/${lessonId}`),
  })
