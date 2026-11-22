'use client'

import { useSuspenseQuery, type QueryKey } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { notesQuery } from '../queries'
import { CommentList } from './comment-list'
import { NoteComposer } from './note-composer'

// The Notes tab (spec 004 FR-010, research.md R8): one thread per student and lesson, shared by the
// student and their linked Admin, oldest first, with the reply box below. Loaded when the tab opens.

export function NotesThread(props: {
  lessonId: string
  studentId: string
  asAdmin: boolean
  /** Shown when the thread is empty. */
  emptyText: string
  countKey: QueryKey
}) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<Skeleton className="h-24 rounded-2xl" />}>
        <Thread {...props} />
      </Suspense>
      <NoteComposer {...props} />
    </div>
  )
}

function Thread({
  lessonId,
  studentId,
  emptyText,
}: {
  lessonId: string
  studentId: string
  emptyText: string
}) {
  const t = useTranslations('notes')
  const { data } = useSuspenseQuery(notesQuery(lessonId, studentId))
  if (data.comments.length === 0) return <p className="text-muted-foreground">{emptyText}</p>
  return <CommentList comments={data.comments} label={t('thread')} mineOnRight />
}
