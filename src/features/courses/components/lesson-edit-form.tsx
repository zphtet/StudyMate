'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useFormatter, useTimeZone, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, type MouseEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { checkboxClass, checkboxLabelClass, Field, inputClass } from '@/components/shared/field'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { unwrap } from '@/lib/result'
import { todayIn } from '@/lib/time'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { inlineMediaMarkdown } from '../files'
import { saveLesson, setLessonStatus } from '../lesson-actions'
import { adminLessonQuery, courseKeys, lessonKeys } from '../queries'
import { DeleteLessonSheet } from './delete-lesson-sheet'
import {
  lessonFieldsSchema,
  MAX_CONTENT_BYTES,
  utf8Bytes,
  type LessonFields,
  type LessonFieldsInput,
} from '../schemas'
import type { AdminLesson } from '../types'
import { uploadLessonFile } from '../upload'
import { useAutosave, type AutosaveStatus } from '../use-autosave'
import { AttachmentList, useAddResource } from './attachment-list'
import { LessonEditor } from './lesson-editor'

// Lesson editor screen (screen 20-AdminLessonEdit; spec 002 US2, contracts/ui-routes.md). Every
// field autosaves 3 s after the last change (research.md R6); Published lessons save in place.

// Three fields share a phone-width row: keep the select text roomy.
const selectClass = cn(inputClass, 'w-full border border-input pr-7 pl-3')

const fromLesson = (lesson: AdminLesson): LessonFieldsInput => ({
  title: lesson.title,
  estMinutes: lesson.estMinutes,
  sectionId: lesson.sectionId,
  unlockRule: lesson.unlockRule,
  contentMd: lesson.contentMd,
  assignmentPrompt: lesson.assignmentPrompt ?? '',
  requireSubmission: lesson.requireSubmission,
})

export function LessonEditForm({ lessonId }: { lessonId: string }) {
  const tDelete = useTranslations('deleteFlow')
  const t = useTranslations('lessonEditor')
  const tErrors = useTranslations('errors')
  const validation = useValidationMessage()
  const errorMessage = useErrorMessage()
  const timeZone = useTimeZone() ?? 'UTC'
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: lesson } = useSuspenseQuery(adminLessonQuery(lessonId))
  const courseUrl = `/a/courses/${lesson.courseId}`
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Next keeps recently visited screens in the page (hidden), so two editors can exist at once:
  // ids must be unique per instance.
  const uid = useId()
  const id = (name: string) => `${uid}${name}`

  const form = useForm<LessonFieldsInput, unknown, LessonFields>({
    resolver: zodResolver(lessonFieldsSchema),
    defaultValues: fromLesson(lesson),
  })
  const { errors } = form.formState
  const unlockRule = useWatch({ control: form.control, name: 'unlockRule' })

  const autosave = useAutosave({
    lessonId,
    form,
    save: async (fields) => unwrap(await saveLesson({ lessonId, fields })),
    initialSavedAt: lesson.updatedAt,
    onSaved: (fields, updatedAt) => {
      const before = queryClient.getQueryData<AdminLesson>(lessonKeys.admin(lessonId))
      queryClient.setQueryData<AdminLesson>(lessonKeys.admin(lessonId), (old) =>
        old ? { ...old, ...fields, updatedAt } : old,
      )
      // The course page shows titles, minutes and sections; it refetches when it next mounts.
      void queryClient.invalidateQueries({ queryKey: courseKeys.adminCourse(lesson.courseId) })
      // A new section changes the lesson's number and the "After {n}" label.
      if (before && before.sectionId !== fields.sectionId) {
        void queryClient.invalidateQueries({ queryKey: lessonKeys.admin(lessonId) })
      }
    },
  })

  const addResource = useAddResource(lessonId)
  async function uploadInline(file: File, kind: 'image' | 'audio') {
    const input = await uploadLessonFile({ courseId: lesson.courseId, lessonId, file, kind })
    const resource = await addResource.mutateAsync(input)
    return inlineMediaMarkdown(resource.id, resource.name)
  }

  const status = useMutation({
    mutationFn: async (next: 'draft' | 'published') =>
      unwrap(await setLessonStatus({ lessonId, status: next })),
    onSuccess: ({ status: next }) => {
      queryClient.setQueryData<AdminLesson>(lessonKeys.admin(lessonId), (old) =>
        old ? { ...old, status: next } : old,
      )
      void queryClient.invalidateQueries({ queryKey: courseKeys.admin })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  /** Saves pending changes; explains why when it can't. */
  async function flushOrExplain() {
    if (await autosave.flush()) return true
    const values = form.getValues()
    if (utf8Bytes(values.contentMd ?? '') > MAX_CONTENT_BYTES) {
      toast.error(tErrors('content_too_long'))
    } else if (!lessonFieldsSchema.safeParse(values).success) {
      toast.error(t('checkFields'))
    } else {
      toast.error(errorMessage(null))
    }
    return false
  }

  async function saveAndLeave() {
    if (!(await flushOrExplain())) return
    toast.success(t('savedToast'))
    router.push(courseUrl)
  }

  async function changeStatus(next: 'draft' | 'published') {
    if (!(await flushOrExplain())) return
    await status.mutateAsync(next)
    if (next === 'published') {
      toast.success(t('publishedToast'))
      router.push(courseUrl)
    } else {
      toast.success(t('unpublishedToast'))
    }
  }

  async function onBack(event: MouseEvent<HTMLAnchorElement>) {
    if (!autosave.unsaved) return
    event.preventDefault()
    if (await autosave.flush()) router.push(courseUrl)
    else setLeaving(true)
  }

  const busy = status.isPending
  const previous = lesson.previousLesson

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-5">
        <Link
          href={courseUrl}
          onClick={(e) => void onBack(e)}
          aria-label={t('back')}
          className="-ml-2 flex size-11 items-center justify-center justify-self-start rounded-full hover:bg-muted"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <SaveState
          status={autosave.status}
          savedAt={autosave.savedAt}
          onRetry={autosave.retry}
          className="justify-self-end"
        />
      </header>

      <Field
        id={id('lesson-title')}
        label={t('titleLabel')}
        error={validation(errors.title?.message)}
      >
        <Input
          id={id('lesson-title')}
          className={cn(inputClass, 'text-lg font-semibold md:text-lg')}
          aria-invalid={!!errors.title}
          {...form.register('title')}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field
          id={id('lesson-minutes')}
          label={t('minutes')}
          error={validation(errors.estMinutes?.message)}
        >
          <Input
            id={id('lesson-minutes')}
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            className={inputClass}
            aria-invalid={!!errors.estMinutes}
            {...form.register('estMinutes', { valueAsNumber: true })}
          />
        </Field>
        <Field id={id('lesson-section')} label={t('section')}>
          <Controller
            control={form.control}
            name="sectionId"
            render={({ field }) => (
              <select
                id={id('lesson-section')}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                onBlur={field.onBlur}
                className={selectClass}
              >
                <option value="">{t('noSection')}</option>
                {lesson.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>
        <Field id={id('lesson-unlock')} label={t('unlocks')}>
          <Controller
            control={form.control}
            name="unlockRule"
            render={({ field }) => (
              <select
                id={id('lesson-unlock')}
                value={field.value.type}
                onChange={(e) => {
                  const type = e.target.value as LessonFields['unlockRule']['type']
                  field.onChange(
                    type === 'on_date'
                      ? {
                          type,
                          date:
                            field.value.type === 'on_date' ? field.value.date : todayIn(timeZone),
                        }
                      : { type },
                  )
                }}
                onBlur={field.onBlur}
                className={selectClass}
              >
                <option value="after_previous">
                  {previous
                    ? t('unlockAfter', { number: previous.number })
                    : t('unlockAfterPrevious')}
                </option>
                <option value="none">{t('unlockNone')}</option>
                <option value="on_date">{t('unlockOnDate')}</option>
              </select>
            )}
          />
        </Field>
      </div>

      {unlockRule?.type === 'on_date' && (
        <Field
          id={id('lesson-unlock-date')}
          label={t('unlockDate')}
          error={validation(
            (errors.unlockRule as { date?: { message?: string } } | undefined)?.date?.message,
          )}
        >
          <Input
            id={id('lesson-unlock-date')}
            type="date"
            value={unlockRule.date}
            onChange={(e) =>
              form.setValue(
                'unlockRule',
                { type: 'on_date', date: e.target.value },
                { shouldDirty: true },
              )
            }
            className={inputClass}
          />
          <p className="text-sm text-muted-foreground">{t('unlockDateHint')}</p>
        </Field>
      )}

      <Controller
        control={form.control}
        name="contentMd"
        render={({ field }) => (
          <LessonEditor value={field.value} onChange={field.onChange} upload={uploadInline} />
        )}
      />

      <AttachmentList
        courseId={lesson.courseId}
        lessonId={lessonId}
        resources={lesson.resources.filter((r) => r.kind === 'file' || r.kind === 'link')}
      />

      <Field
        id={id('lesson-assignment')}
        label={t('assignment')}
        error={validation(errors.assignmentPrompt?.message)}
      >
        <Textarea
          id={id('lesson-assignment')}
          rows={3}
          placeholder={t('assignmentPlaceholder')}
          className="min-h-24 rounded-2xl bg-card px-4 py-3 text-base md:text-base"
          aria-invalid={!!errors.assignmentPrompt}
          {...form.register('assignmentPrompt')}
        />
      </Field>

      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label htmlFor={id('lesson-require')} className={checkboxLabelClass}>
          {t('requireSubmission')}
        </Label>
        <Controller
          control={form.control}
          name="requireSubmission"
          render={({ field }) => (
            <Checkbox
              id={id('lesson-require')}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              className={checkboxClass}
            />
          )}
        />
      </div>

      <BottomBar contentClassName="lg:max-w-5xl">
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="size-13 rounded-xl text-destructive"
          aria-label={tDelete('deleteLesson')}
          disabled={busy}
          onClick={() => setDeleting(true)}
        >
          <Trash2 aria-hidden />
        </Button>
        {lesson.status === 'draft' ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="xl"
              className="flex-1"
              disabled={busy}
              onClick={() => void saveAndLeave()}
            >
              {t('saveDraft')}
            </Button>
            <Button
              type="button"
              size="xl"
              className="flex-1"
              disabled={busy}
              onClick={() => void changeStatus('published')}
            >
              {t('publish')}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="xl"
              className="flex-1"
              disabled={busy}
              onClick={() => void changeStatus('draft')}
            >
              {t('unpublish')}
            </Button>
            <Button
              type="button"
              size="xl"
              className="flex-1"
              disabled={busy}
              onClick={() => void saveAndLeave()}
            >
              {t('save')}
            </Button>
          </>
        )}
      </BottomBar>

      <DeleteLessonSheet
        lesson={lesson}
        courseId={lesson.courseId}
        courseTitle={lesson.courseTitle}
        open={deleting}
        onOpenChange={setDeleting}
        beforeDelete={() => autosave.flush()}
        onDeleted={() => router.replace(courseUrl)}
      />

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('leaveBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('stay')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => router.push(courseUrl)}>
              {t('leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

/** "Saved hh:mm" (viewer's time zone) / "Saving…" / "Not saved · Retry". */
function SaveState({
  status,
  savedAt,
  onRetry,
  className,
}: {
  status: AutosaveStatus
  savedAt: string
  onRetry: () => void
  className?: string
}) {
  const t = useTranslations('lessonEditor')
  const format = useFormatter()
  return (
    <p role="status" className={cn('text-sm text-muted-foreground', className)}>
      {status === 'saving' ? (
        <span>{t('saving')}</span>
      ) : status === 'error' ? (
        <span className="flex items-center text-destructive">
          {t('notSaved')} ·
          <Button
            type="button"
            variant="link"
            className="h-11 px-1.5 text-sm text-destructive"
            onClick={onRetry}
          >
            {t('retry')}
          </Button>
        </span>
      ) : status === 'invalid' || status === 'paused' ? (
        <span className="text-destructive">{t('notSaved')}</span>
      ) : (
        <span>
          {t('saved', {
            time: format.dateTime(new Date(savedAt), {
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }),
          })}
        </span>
      )}
    </p>
  )
}
