'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { postNote } from '../actions'
import { lessonWorkKeys } from '../queries'
import { commentBodySchema } from '../schemas'
import type { CommentView } from '../types'

// The Notes reply box (spec 004 FR-010; contracts/ui-routes.md › Lesson): 1–2000 characters with a
// counter after 1800, and Send. The message appears at once and is taken back if posting fails.

const MAX = 2000
const COUNTER_FROM = 1800

export function NoteComposer({
  lessonId,
  studentId,
  asAdmin,
  countKey,
}: {
  lessonId: string
  /** Whose thread. */
  studentId: string
  /** Admins name the student; students post in their own thread. */
  asAdmin: boolean
  /** The query that holds "Notes · n". */
  countKey: QueryKey
}) {
  const t = useTranslations('notes')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const id = useId()
  const [body, setBody] = useState('')
  const notesKey = lessonWorkKeys.notes(lessonId, studentId)
  // Posting a note needs the server (spec 008 R14); typing stays possible.
  const connection = useNeedsConnection()

  const post = useMutation({
    mutationFn: async (text: string) =>
      unwrap(await postNote({ lessonId, ...(asAdmin && { studentId }), body: text })),
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: notesKey })
      const snapshot = queryClient.getQueryData<{ comments: CommentView[] }>(notesKey)
      const pending: CommentView = {
        id: `pending-${Date.now()}`,
        authorId: '',
        authorName: t('you'),
        isMine: true,
        body: text.trim(),
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<{ comments: CommentView[] }>(notesKey, (old) => ({
        comments: [...(old?.comments ?? []), pending],
      }))
      setBody('')
      return { snapshot }
    },
    onError: (error, text, context) => {
      queryClient.setQueryData(notesKey, context?.snapshot)
      setBody(text)
      toast.error(errorMessage(error))
    },
    onSettled: () =>
      Promise.all(
        [notesKey, countKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  })

  const valid = commentBodySchema.safeParse(body).success
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (connection.disabled) return
    if (valid) post.mutate(body)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {t('label')}
      </label>
      <Textarea
        id={id}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t('placeholder')}
        maxLength={MAX}
        rows={3}
        className="min-h-24 rounded-2xl bg-card px-4 py-3"
      />
      <div className="flex items-center justify-end gap-3">
        {body.length > COUNTER_FROM && (
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {t('counter', { count: body.length, max: MAX })}
          </span>
        )}
        <Button
          type="submit"
          size="touch"
          disabled={connection.disabled || !valid || post.isPending}
          aria-describedby={connection.describedBy}
        >
          <Send aria-hidden />
          {t('send')}
        </Button>
      </div>
    </form>
  )
}
