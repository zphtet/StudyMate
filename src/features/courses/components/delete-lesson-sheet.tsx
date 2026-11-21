'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { deleteLesson, setLessonStatus } from '../lesson-actions'
import { courseKeys, lessonImpactQuery, lessonKeys } from '../queries'
import type { LessonStatus } from '../types'

// Delete-lesson sheet (screen 21-AdminDelete; US3 scenario 1). Lists the assigned students and their
// work so the admin can "Unpublish instead" (Published lessons only). Copy is gender-neutral.

export type DeleteLessonTarget = { id: string; title: string; number: number; status: LessonStatus }

export function DeleteLessonSheet({
  lesson,
  courseId,
  courseTitle,
  open,
  onOpenChange,
  beforeDelete,
  onDeleted,
}: {
  lesson: DeleteLessonTarget
  courseId: string
  courseTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** E.g. the editor flushes its autosave so it can't run against a deleted lesson. */
  beforeDelete?: () => Promise<unknown>
  onDeleted?: () => void
}) {
  const t = useTranslations('deleteFlow')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const impact = useQuery({ ...lessonImpactQuery(lesson.id), enabled: open })
  const students = impact.data?.students ?? []

  const invalidateCourse = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKeys.adminCourse(courseId) }),
      queryClient.invalidateQueries({ queryKey: courseKeys.adminList }),
      queryClient.invalidateQueries({ queryKey: courseKeys.deleted }),
    ])

  const remove = useMutation({
    mutationFn: async () => {
      await beforeDelete?.()
      return unwrap(await deleteLesson({ lessonId: lesson.id }))
    },
    onSuccess: async () => {
      await invalidateCourse()
      queryClient.removeQueries({ queryKey: lessonKeys.admin(lesson.id) })
      toast.success(t('lessonDeleted'))
      onOpenChange(false)
      onDeleted?.()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const unpublish = useMutation({
    mutationFn: async () => unwrap(await setLessonStatus({ lessonId: lesson.id, status: 'draft' })),
    onSuccess: async () => {
      await Promise.all([
        invalidateCourse(),
        queryClient.invalidateQueries({ queryKey: lessonKeys.admin(lesson.id) }),
      ])
      toast.success(t('unpublished'))
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const busy = remove.isPending || unpublish.isPending
  const published = lesson.status === 'published'

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/* No corner ✕: Cancel below is the 44 px way out (constitution V). */}
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader className="gap-3 text-left">
          <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Trash2 className="size-6" aria-hidden />
          </span>
          <SheetTitle className="text-2xl leading-tight font-bold">
            {t('title', { title: lesson.title })}
          </SheetTitle>
          <SheetDescription className="text-base">
            {t('body', { number: lesson.number, course: courseTitle })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {impact.isPending && open ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t('checking')}
            </p>
          ) : (
            students.length > 0 && (
              <ul className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
                {students.map((s) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <InitialAvatar name={s.displayName} seed={s.id} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{s.displayName}</span>
                    <span
                      className={cn(
                        'font-medium',
                        s.work === 'not_started' ? 'text-muted-foreground' : 'text-destructive',
                      )}
                    >
                      {t(`work.${s.work}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}

          {published && (
            <p className="flex gap-3 rounded-2xl bg-accent p-4 text-accent-foreground">
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>{t.rich('keepWork', { b: (chunks) => <strong>{chunks}</strong> })}</span>
            </p>
          )}

          <Button
            size="xl"
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {t('deleteLesson')}
          </Button>
          {published && (
            <Button size="xl" variant="outline" disabled={busy} onClick={() => unpublish.mutate()}>
              {unpublish.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {t('unpublishInstead')}
            </Button>
          )}
          <Button
            size="xl"
            variant="ghost"
            className="text-primary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">{t('courseFootnote')}</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
