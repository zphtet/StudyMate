import { Screen } from '@/components/layout/screen'
import { LessonEditForm } from '@/features/courses/components/lesson-edit-form'
import { WithAdminLesson } from '@/features/courses/components/with-admin-course'

// Lesson editor (screen 20-AdminLessonEdit; spec 002 US2). Split view from 1024 px.
export default function LessonEditPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>
}) {
  return (
    <Screen className="lg:max-w-5xl">
      <WithAdminLesson ids={params}>
        <Editor ids={params} />
      </WithAdminLesson>
    </Screen>
  )
}

async function Editor({ ids }: { ids: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ids
  return <LessonEditForm lessonId={lessonId} />
}
