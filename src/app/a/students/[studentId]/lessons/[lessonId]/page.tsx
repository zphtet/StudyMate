import { Screen } from '@/components/layout/screen'
import { LessonReview } from '@/features/progress/components/lesson-review'
import { WithAdminLessonReview } from '@/features/progress/components/with-admin-progress'

// One student's lesson for the Admin: Mark done / Reopen (spec 004 US1 scenario 4); the review and
// Notes come with US2 (contracts/ui-routes.md › Lesson review).
export default function AdminLessonReviewPage({
  params,
}: {
  params: Promise<{ studentId: string; lessonId: string }>
}) {
  return (
    <Screen>
      <WithAdminLessonReview ids={params}>
        <ReviewView ids={params} />
      </WithAdminLessonReview>
    </Screen>
  )
}

async function ReviewView({ ids }: { ids: Promise<{ studentId: string; lessonId: string }> }) {
  const { studentId, lessonId } = await ids
  return <LessonReview studentId={studentId} lessonId={lessonId} />
}
