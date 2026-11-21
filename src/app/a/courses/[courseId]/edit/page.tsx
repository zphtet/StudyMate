import { Screen } from '@/components/layout/screen'
import { EditCourse } from '@/features/courses/components/edit-course'
import { WithAdminCourse } from '@/features/courses/components/with-admin-course'

// Edit course (screen 19-AdminCourseForm; spec 002 US1).
export default function EditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const courseId = params.then((p) => p.courseId)
  return (
    <Screen>
      <WithAdminCourse courseId={courseId}>
        <Edit courseId={courseId} />
      </WithAdminCourse>
    </Screen>
  )
}

async function Edit({ courseId }: { courseId: Promise<string> }) {
  return <EditCourse courseId={await courseId} />
}
