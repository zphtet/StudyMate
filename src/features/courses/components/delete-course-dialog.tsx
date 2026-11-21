'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { deleteCourse } from '../actions'
import { courseKeys } from '../queries'

// Delete course (US3 scenario 2): the admin types the course name; the button stays disabled until
// the trimmed text matches. Restorable from Recently deleted for 30 days.

export function DeleteCourseDialog({
  course,
  onClose,
  onDeleted,
}: {
  /** The course to delete; null keeps the dialog closed. */
  course: { id: string; title: string } | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const t = useTranslations('deleteFlow')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const inputId = useId()
  const [typed, setTyped] = useState('')

  const remove = useMutation({
    mutationFn: async (target: { id: string; title: string }) =>
      unwrap(await deleteCourse({ courseId: target.id, confirmTitle: typed })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      toast.success(t('courseDeleted'))
      close()
      onDeleted?.()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  function close() {
    setTyped('')
    onClose()
  }

  const matches = course !== null && typed.trim() === course.title.trim()

  return (
    <AlertDialog
      open={course !== null}
      onOpenChange={(open) => !open && !remove.isPending && close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('deleteCourseTitle', { title: course?.title ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t('deleteCourseBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId} className="text-base">
            {t('typeName')}
          </Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="h-12 text-base"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch" disabled={remove.isPending}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            size="touch"
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={!matches || remove.isPending}
            onClick={() => course && remove.mutate(course)}
          >
            {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {t('deleteCourse')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
