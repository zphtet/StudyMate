import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/page-header'
import { StudentCourseList } from '@/features/courses/components/student-course-list'
import { WithStudentCourses } from '@/features/courses/components/with-student-course'

// Student Courses tab (screen 05-Courses, partial; spec 002 US4).
export default async function CoursesPage() {
  const t = await getTranslations('studentCourses')
  return (
    <>
      <PageHeader title={t('title')} />
      <WithStudentCourses>
        <StudentCourseList />
      </WithStudentCourses>
    </>
  )
}
