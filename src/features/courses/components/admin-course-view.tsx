'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { adminCourseQuery } from '../queries'
import type { AdminLessonRow } from '../types'
import { AdminCourseHeader } from './admin-course-header'
import { DeleteLessonSheet } from './delete-lesson-sheet'
import { SortableLessonList, SwipeDeleteButton } from './sortable-lessons'

// Admin course page (screen 18-AdminCourse): header (US1), then sections and lessons with drag and
// drop (US2). Swiping a lesson left offers Delete, which opens the delete-lesson sheet (US3).
export function AdminCourseView({ courseId }: { courseId: string }) {
  const t = useTranslations('courseDetail')
  const { data: detail } = useSuspenseQuery(adminCourseQuery(courseId))
  const [deleting, setDeleting] = useState<AdminLessonRow | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <AdminCourseHeader detail={detail} />
      <SortableLessonList
        detail={detail}
        deleteAction={(lesson) => <SwipeDeleteButton onClick={() => setDeleting(lesson)} />}
      />
      <p className="px-2 text-center text-sm text-muted-foreground">{t('hint')}</p>
      {deleting && (
        <DeleteLessonSheet
          lesson={deleting}
          courseId={courseId}
          courseTitle={detail.course.title}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      )}
    </div>
  )
}
