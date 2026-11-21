import { Screen } from '@/components/layout/screen'
import { StudentLessonView } from '@/features/courses/components/student-lesson-view'
import { WithStudentLesson } from '@/features/courses/components/with-student-course'

// Student lesson (screen 10-Lesson, partial; spec 002 US4 scenario 3). Locked lessons show why.
export default function StudentLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const lessonId = params.then((p) => p.lessonId)
  return (
    <Screen>
      <WithStudentLesson lessonId={lessonId}>
        <LessonView lessonId={lessonId} />
      </WithStudentLesson>
    </Screen>
  )
}

async function LessonView({ lessonId }: { lessonId: Promise<string> }) {
  return <StudentLessonView lessonId={await lessonId} />
}
