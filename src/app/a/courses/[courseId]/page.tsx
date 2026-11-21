import { Screen } from '@/components/layout/screen'
import { AdminCourseView } from '@/features/courses/components/admin-course-view'
import { WithAdminCourse } from '@/features/courses/components/with-admin-course'

// Admin course page (screen 18-AdminCourse; spec 002 US1 + US2).
export default function AdminCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const courseId = params.then((p) => p.courseId)
  return (
    <Screen>
      <WithAdminCourse courseId={courseId}>
        <CourseView courseId={courseId} />
      </WithAdminCourse>
    </Screen>
  )
}

async function CourseView({ courseId }: { courseId: Promise<string> }) {
  return <AdminCourseView courseId={await courseId} />
}
