'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { setCourseStatus } from '../actions'
import { courseKeys } from '../queries'
import type { AdminCourseListItem } from '../types'

// The ⋯ items US3 adds to a course card: Archive (Active) or Unarchive (Archived), and Delete course.
// Deleting opens a dialog owned by the list, because menu content unmounts when the menu closes.
export function CourseLifecycleItems({
  course,
  onDelete,
}: {
  course: AdminCourseListItem
  onDelete: () => void
}) {
  const t = useTranslations('courses')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()

  const status = useMutation({
    mutationFn: async (next: 'active' | 'archived') =>
      unwrap(await setCourseStatus({ courseId: course.id, status: next })),
    onSuccess: async ({ status: next }) => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      toast.success(t(next === 'archived' ? 'archivedToast' : 'unarchivedToast'))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <>
      {course.status === 'active' && (
        <DropdownMenuItem className="min-h-11 text-base" onSelect={() => status.mutate('archived')}>
          <Archive aria-hidden /> {t('archive')}
        </DropdownMenuItem>
      )}
      {course.status === 'archived' && (
        <DropdownMenuItem className="min-h-11 text-base" onSelect={() => status.mutate('active')}>
          <ArchiveRestore aria-hidden /> {t('unarchive')}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" className="min-h-11 text-base" onSelect={onDelete}>
        <Trash2 aria-hidden /> {t('deleteCourse')}
      </DropdownMenuItem>
    </>
  )
}
