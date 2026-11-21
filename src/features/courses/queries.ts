import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AdminCourseDetail,
  AdminCourseList,
  AdminLesson,
  StudentCourse,
  StudentCourseList,
  StudentLesson,
} from './types'

// TanStack Query options for the 002 Route Handlers (contracts/route-handlers.md › Query keys).

export const courseKeys = {
  admin: ['courses', 'admin'] as const,
  adminList: ['courses', 'admin', 'list'] as const,
  adminCourse: (courseId: string) => ['courses', 'admin', courseId] as const,
}

export const lessonKeys = {
  admin: (lessonId: string) => ['lessons', 'admin', lessonId] as const,
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
