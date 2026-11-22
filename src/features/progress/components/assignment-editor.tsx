'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bold, Italic, List, Loader2, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Markdown } from '@/components/shared/markdown'
import { MdTextarea } from '@/components/shared/md-textarea'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { Button } from '@/components/ui/button'
import { MAX_CONTENT_BYTES, utf8Bytes } from '@/lib/content'
import { ActionResultError, unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { saveDraft, submitAssignment } from '../actions'
import { lessonWorkKeys } from '../queries'
import { MAX_IMAGES, type SaveDraftInput } from '../schemas'
import type { LessonWork, SubmissionView } from '../types'
import { removeSubmissionImage, uploadSubmissionImage } from '../upload'
import { ImageStrip, type EditorImage } from './image-strip'

// The student's answer while it is editable (Draft, Needs redo or none; spec 004 US2 scenarios 1, 2,
// 4; research.md R7). The text and photos live in local state, so a refetch (Realtime, focus) never
// overwrites what the student is typing. Autosave runs 1.5 s after the last change and when the page
// is hidden; saves and the submit run one after another (one mutation scope).

const AUTOSAVE_MS = 1500

type Format = 'bold' | 'italic' | 'list'

export function AssignmentEditor({
  lessonId,
  studentId,
  submission,
}: {
  lessonId: string
  studentId: string
  submission: SubmissionView | null
}) {
  const t = useTranslations('submission')
  const f = useInstantFormat()
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const workKey = lessonWorkKeys.work(lessonId)

  const [text, setText] = useState(submission?.bodyMd ?? '')
  const [images, setImages] = useState<EditorImage[]>(
    () =>
      submission?.attachments.map(({ path, name, size, url }) => ({
        path,
        name,
        size,
        src: url,
      })) ?? [],
  )
  // A Needs redo answer was last written by the review, not by a save.
  const [savedAt, setSavedAt] = useState(
    submission?.status === 'draft' ? submission.updatedAt : null,
  )
  const [uploading, setUploading] = useState(0)

  // The latest values for saves started by timers and page events.
  const latest = useRef({ text, images })
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const area = useRef<HTMLDivElement>(null)
  const previews = useRef<string[]>([])

  const tooLong = utf8Bytes(text) > MAX_CONTENT_BYTES
  const scope = { id: `answer-${lessonId}` }
  const input = (): SaveDraftInput => ({
    lessonId,
    bodyMd: latest.current.text,
    attachments: latest.current.images.map(({ path, name, size }) => ({ path, name, size })),
  })

  /** The photos as the read-only view shows them, until a refetch brings the server's urls. */
  const imageViews = () =>
    latest.current.images.map(({ path, name, size, src }) => ({ path, name, size, url: src }))

  const save = useMutation({
    scope,
    mutationFn: async (values: SaveDraftInput) => unwrap(await saveDraft(values)),
    // The saved values are already on screen; only the Lesson tab's card needs the new time.
    onSuccess: (result, values) => {
      setSavedAt(result.updatedAt)
      queryClient.setQueryData<LessonWork>(
        workKey,
        (old) =>
          old && {
            ...old,
            submission: {
              id: result.submissionId,
              status: result.status,
              bodyMd: values.bodyMd,
              attachments: imageViews(),
              submittedAt: old.submission?.submittedAt ?? null,
              reviewedAt: old.submission?.reviewedAt ?? null,
              updatedAt: result.updatedAt,
            },
          },
      )
    },
    onError: (error) => {
      dirty.current = true
      toast.error(errorMessage(error))
    },
  })
  const { mutate: saveNow } = save

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current || utf8Bytes(latest.current.text) > MAX_CONTENT_BYTES) return
    dirty.current = false
    saveNow(input())
    // `input` only reads refs and the lesson id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveNow, lessonId])

  const change = (next: Partial<typeof latest.current>, { now = false } = {}) => {
    latest.current = { ...latest.current, ...next }
    if (next.text !== undefined) setText(next.text)
    if (next.images !== undefined) setImages(next.images)
    dirty.current = true
    clearTimeout(timer.current)
    if (now) flush()
    else timer.current = setTimeout(flush, AUTOSAVE_MS)
  }

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    const urls = previews.current
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [flush])

  const submit = useMutation({
    scope,
    mutationFn: async (values: SaveDraftInput) => unwrap(await submitAssignment(values)),
    onSuccess: (result) => {
      // The read-only view replaces the editor at once; the refetch fills in the server's copy.
      queryClient.setQueryData<LessonWork>(
        workKey,
        (old) =>
          old && {
            ...old,
            submission: {
              id: result.submissionId,
              status: 'submitted',
              bodyMd: latest.current.text,
              attachments: imageViews(),
              submittedAt: result.submittedAt,
              reviewedAt: null,
              updatedAt: result.submittedAt,
            },
          },
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: workKey }),
  })

  const onSubmit = () => {
    if (latest.current.text.trim() === '' && latest.current.images.length === 0) {
      toast.error(errorMessage(new ActionResultError('submission_empty')))
      return
    }
    clearTimeout(timer.current)
    dirty.current = false
    submit.mutate(input())
  }

  async function addImages(files: File[]) {
    const room = MAX_IMAGES - latest.current.images.length - uploading
    if (files.length > room) toast.error(errorMessage(new ActionResultError('too_many_images')))
    const picked = files.slice(0, Math.max(room, 0))
    setUploading((n) => n + picked.length)
    for (const file of picked) {
      try {
        const image = await uploadSubmissionImage(studentId, lessonId, file)
        const src = URL.createObjectURL(file)
        previews.current.push(src)
        change({ images: [...latest.current.images, { ...image, src }] }, { now: true })
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  async function removeImage(image: EditorImage) {
    try {
      await removeSubmissionImage(image.path)
      change({ images: latest.current.images.filter((i) => i.path !== image.path) }, { now: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  // Formatting goes through the editor's own commands, so it lands at the cursor and can be undone.
  async function format(kind: Format) {
    const element = area.current?.querySelector('textarea')
    if (!element) return
    const md = await import('@uiw/react-md-editor/nohighlight')
    const command = { bold: md.bold, italic: md.italic, list: md.unorderedListCommand }[kind]
    new md.TextAreaCommandOrchestrator(element).executeCommand(command)
  }

  const tools = [
    { kind: 'bold', label: t('bold'), icon: Bold },
    { kind: 'italic', label: t('italic'), icon: Italic },
    { kind: 'list', label: t('list'), icon: List },
  ] as const
  const busy = submit.isPending

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-3xl border bg-card">
        <div
          role="toolbar"
          aria-label={t('toolbar')}
          className="flex items-center border-b bg-muted/40 p-1"
        >
          {tools.map(({ kind, label, icon: Icon }) => (
            <Button
              key={kind}
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={label}
              title={label}
              disabled={busy}
              onClick={() => void format(kind)}
            >
              <Icon aria-hidden className="size-5" />
            </Button>
          ))}
        </div>
        <div ref={area}>
          <MdTextarea
            value={text}
            onChange={(next) => change({ text: next })}
            label={t('answer')}
            placeholder={t('placeholder')}
            live={false}
            renderPreview={(source) => <Markdown source={source} />}
          />
        </div>
      </div>

      <ImageStrip
        images={images}
        uploading={uploading}
        disabled={busy}
        onAdd={(files) => void addImages(files)}
        onRemove={(image) => void removeImage(image)}
      />

      <div className="flex items-center gap-3">
        <p role="status" className="min-w-0 flex-1 text-sm text-muted-foreground">
          {tooLong ? (
            <span className="text-destructive">{t('tooLong')}</span>
          ) : save.isPending ? (
            t('saving')
          ) : savedAt ? (
            t('saved', { time: f.time(savedAt) })
          ) : null}
        </p>
        <Button
          type="button"
          size="xl"
          disabled={busy || uploading > 0 || tooLong}
          onClick={onSubmit}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {t('submit')}
        </Button>
      </div>
    </div>
  )
}
