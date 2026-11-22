import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/page-header'
import { StudentCourseList } from '@/features/courses/components/student-course-list'
import { WithStudentCourses } from '@/features/courses/components/with-student-course'
import { StudiedWeekCard } from '@/features/progress/components/studied-week-card'
import { WithProgress } from '@/features/progress/components/with-progress'

// Student Courses tab (screen 05-Courses, partial; spec 002 US4): spec 004's "Studied this week" card,
// then the course list.
export default async function CoursesPage() {
  const t = await getTranslations('studentCourses')
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mb-5">
        <WithProgress view="week" card>
          <StudiedWeekCard />
        </WithProgress>
      </div>
      <WithStudentCourses>
        <StudentCourseList />
      </WithStudentCourses>
    </>
  )
}
