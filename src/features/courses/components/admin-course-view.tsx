'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { adminCourseQuery } from '../queries'
import { AdminCourseHeader } from './admin-course-header'
import { SortableLessonList, type LessonRowAction } from './sortable-lessons'

// Admin course page (screen 18-AdminCourse): header (US1), then sections and lessons with drag and
// drop (US2). A course without sections shows the untitled group with "+ Add lesson".
export function AdminCourseView({
  courseId,
  deleteAction,
}: {
  courseId: string
  deleteAction?: LessonRowAction
}) {
  const t = useTranslations('courseDetail')
  const { data: detail } = useSuspenseQuery(adminCourseQuery(courseId))

  return (
    <div className="flex flex-col gap-6">
      <AdminCourseHeader detail={detail} />
      <SortableLessonList detail={detail} deleteAction={deleteAction} />
      <p className="px-2 text-center text-sm text-muted-foreground">{t('hint')}</p>
    </div>
  )
}
