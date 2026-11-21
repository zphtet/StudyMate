'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { adminCourseQuery } from '../queries'
import { CourseForm } from './course-form'
import { DeleteCourseDialog } from './delete-course-dialog'

/** Edit course: the course form prefilled from the cached course (screen 19-AdminCourseForm), plus "Delete course" (US3). */
export function EditCourse({ courseId }: { courseId: string }) {
  const t = useTranslations('deleteFlow')
  const router = useRouter()
  const { data } = useSuspenseQuery(adminCourseQuery(courseId))
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      <CourseForm mode="edit" course={data.course} />
      <div className="mt-8 flex justify-center pb-28">
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleting(true)}
        >
          <Trash2 aria-hidden /> {t('deleteCourse')}
        </Button>
      </div>
      <DeleteCourseDialog
        course={deleting ? { id: data.course.id, title: data.course.title } : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => router.push('/a/courses')}
      />
    </>
  )
}
