'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Link2, Loader2, Plus, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Field, inputClass } from '@/components/shared/field'
import { Segmented } from '@/components/shared/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ActionResultError, unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { addLessonResource, removeLessonResource } from '../lesson-actions'
import { lessonKeys } from '../queries'
import { ALLOWED_MIME_TYPES, linkResourceSchema, type ResourceInput } from '../schemas'
import type { AdminLesson, Resource } from '../types'
import { checkFile, discardUpload, uploadLessonFile } from '../upload'

// Attachments of a lesson (screen 20-AdminLessonEdit; data-model.md LessonResource.kind file | link):
// chips with name and ×, and "+ File or link" (a sheet: upload a file, or a link with a title).
// Removing deletes the row and the file at once (data-model.md › LessonResource).

type LinkInput = z.input<typeof linkResourceSchema>
type LinkFields = z.output<typeof linkResourceSchema>

/** Adds a recorded resource to the cached lesson. */
export function useAddResource(lessonId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (resource: ResourceInput) => {
      const result = await addLessonResource({ lessonId, resource })
      if (!result.ok && resource.kind !== 'link') await discardUpload(resource.storagePath)
      return unwrap(result)
    },
    onSuccess: (resource) =>
      queryClient.setQueryData<AdminLesson>(lessonKeys.admin(lessonId), (lesson) =>
        lesson ? { ...lesson, resources: [...lesson.resources, resource] } : lesson,
      ),
  })
}

export function AttachmentList({
  courseId,
  lessonId,
  resources,
}: {
  courseId: string
  lessonId: string
  /** file and link resources (inline images and audio live in the Markdown) */
  resources: Resource[]
}) {
  const t = useTranslations('lessonEditor')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const uid = useId()

  const remove = useMutation({
    mutationFn: async (resource: Resource) =>
      unwrap(await removeLessonResource({ resourceId: resource.id })),
    onSuccess: (_data, resource) => {
      queryClient.setQueryData<AdminLesson>(lessonKeys.admin(lessonId), (lesson) =>
        lesson
          ? { ...lesson, resources: lesson.resources.filter((r) => r.id !== resource.id) }
          : lesson,
      )
      toast.success(t('attachmentRemoved'))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <section aria-labelledby={`${uid}attachments-heading`} className="flex flex-col gap-3">
      <h2 id={`${uid}attachments-heading`} className="font-semibold">
        {t('attachments')}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {resources.map((resource) => (
          <li
            key={resource.id}
            className="flex max-w-full items-center rounded-2xl border bg-card pl-4"
          >
            {resource.kind === 'link' ? (
              <Link2 aria-hidden className="mr-2 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText aria-hidden className="mr-2 size-4 shrink-0 text-muted-foreground" />
            )}
            <a
              href={resource.url}
              target="_blank"
              rel={resource.kind === 'link' ? 'noopener noreferrer nofollow' : 'noopener'}
              className="min-w-0 truncate py-3 underline-offset-4 hover:underline"
            >
              {resource.name}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={t('removeAttachment', { name: resource.name })}
              disabled={remove.isPending && remove.variables?.id === resource.id}
              onClick={() => remove.mutate(resource)}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-2xl border-dashed px-4 text-base"
              >
                <Plus aria-hidden /> {t('addAttachment')}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>{t('sheetTitle')}</SheetTitle>
                <SheetDescription>{t('sheetDescription')}</SheetDescription>
              </SheetHeader>
              {open && (
                <AddAttachment
                  courseId={courseId}
                  lessonId={lessonId}
                  onDone={() => setOpen(false)}
                />
              )}
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </section>
  )
}

function AddAttachment({
  courseId,
  lessonId,
  onDone,
}: {
  courseId: string
  lessonId: string
  onDone: () => void
}) {
  const t = useTranslations('lessonEditor')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const [kind, setKind] = useState<'file' | 'link'>('file')
  const uid = useId()
  const [fileError, setFileError] = useState<string | null>(null)
  const add = useAddResource(lessonId)

  const upload = useMutation({
    mutationFn: async (file: File) =>
      add.mutateAsync(await uploadLessonFile({ courseId, lessonId, file, kind: 'file' })),
    onSuccess: onDone,
    onError: (error) => setFileError(errorMessage(error)),
  })

  const linkForm = useForm<LinkInput, unknown, LinkFields>({
    resolver: zodResolver(linkResourceSchema),
    defaultValues: { kind: 'link', name: '', url: '' },
  })
  const { errors } = linkForm.formState

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = checkFile(file)
    if (problem) {
      setFileError(errorMessage(new ActionResultError(problem)))
      return
    }
    setFileError(null)
    upload.mutate(file)
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <Segmented
        name="attachment-kind"
        legend={t('attachmentType')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'file', label: t('typeFile') },
          { value: 'link', label: t('typeLink') },
        ]}
      />
      {kind === 'file' ? (
        <div className="flex flex-col gap-2">
          <label
            className="relative flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed bg-card px-4 font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:opacity-60"
            aria-busy={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 aria-hidden className="size-5 animate-spin" />
            ) : (
              <Upload aria-hidden className="size-5" />
            )}
            {upload.isPending ? t('uploading') : t('chooseFile')}
            <input
              type="file"
              accept={ALLOWED_MIME_TYPES.join(',')}
              className="sr-only"
              aria-label={t('chooseFile')}
              disabled={upload.isPending}
              onChange={onFile}
            />
          </label>
          <p className="text-sm text-muted-foreground">{t('fileHint')}</p>
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={linkForm.handleSubmit((values) =>
            add.mutate(values, {
              onSuccess: onDone,
              onError: (error) => toast.error(errorMessage(error)),
            }),
          )}
        >
          <Field
            id={`${uid}link-name`}
            label={t('linkTitle')}
            error={validation(errors.name?.message)}
          >
            <Input
              id={`${uid}link-name`}
              className={inputClass}
              aria-invalid={!!errors.name}
              {...linkForm.register('name')}
            />
          </Field>
          <Field id={`${uid}link-url`} label={t('linkUrl')} error={validation(errors.url?.message)}>
            <Input
              id={`${uid}link-url`}
              type="url"
              inputMode="url"
              placeholder="https://"
              className={inputClass}
              aria-invalid={!!errors.url}
              {...linkForm.register('url')}
            />
          </Field>
          <Button type="submit" size="xl" disabled={add.isPending}>
            {t('addLink')}
          </Button>
        </form>
      )}
    </div>
  )
}
