import { Screen } from '@/components/layout/screen'
import { WithStudentLesson } from '@/features/courses/components/with-student-course'
import { LessonWorkScreen } from '@/features/progress/components/lesson-work-screen'
import { WithLessonWork } from '@/features/progress/components/with-lesson-work'

// Student lesson (screen 10-Lesson; spec 002 US4 scenario 3, spec 004 US1). Locked lessons show why;
// open ones get the work tabs and the bottom bar.
export default function StudentLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const lessonId = params.then((p) => p.lessonId)
  return (
    <Screen>
      <WithStudentLesson lessonId={lessonId}>
        <WithLessonWork lessonId={lessonId}>
          <LessonView lessonId={lessonId} />
        </WithLessonWork>
      </WithStudentLesson>
    </Screen>
  )
}

async function LessonView({ lessonId }: { lessonId: Promise<string> }) {
  return <LessonWorkScreen lessonId={await lessonId} />
}
