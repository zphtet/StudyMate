import { Screen } from '@/components/layout/screen'
import { CourseForm } from '@/features/courses/components/course-form'
import { WithAdminCourses } from '@/features/courses/components/with-admin-course'

// New course (screen 19-AdminCourseForm; spec 002 US1). The course list seeds "Copy existing course".
export default function NewCoursePage() {
  return (
    <Screen>
      <WithAdminCourses>
        <CourseForm mode="new" />
      </WithAdminCourses>
    </Screen>
  )
}
