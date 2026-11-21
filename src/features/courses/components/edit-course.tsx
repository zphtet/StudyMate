'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { adminCourseQuery } from '../queries'
import { CourseForm } from './course-form'

/** Edit course: the course form prefilled from the cached course (screen 19-AdminCourseForm). */
export function EditCourse({ courseId }: { courseId: string }) {
  const { data } = useSuspenseQuery(adminCourseQuery(courseId))
  return <CourseForm mode="edit" course={data.course} />
}
