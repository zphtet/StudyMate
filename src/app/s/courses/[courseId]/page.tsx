import { Screen } from '@/components/layout/screen'
import { StudentCourseView } from '@/features/courses/components/student-course-view'
import { WithStudentCourse } from '@/features/courses/components/with-student-course'

// Student course (screen 09-Course, partial; spec 002 US4 scenarios 1–2).
export default function StudentCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const courseId = params.then((p) => p.courseId)
  return (
    <Screen>
      <WithStudentCourse courseId={courseId}>
        <CourseView courseId={courseId} />
      </WithStudentCourse>
    </Screen>
  )
}

async function CourseView({ courseId }: { courseId: Promise<string> }) {
  return <StudentCourseView courseId={await courseId} />
}
