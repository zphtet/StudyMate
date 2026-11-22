'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { cn } from '@/lib/utils'
import { lessonWorkQuery } from '../queries'

// The assignment card at the end of the Lesson tab (screen 10-Lesson; contracts/ui-routes.md ›
// Lesson): the prompt's first line and where the answer stands. Opens the Assignment tab. Reads
// "Draft saved · {time}" instead of the screenshot's "3 of 5 written" (research.md R7).

export function AssignmentCard({
  lessonId,
  prompt,
  onOpen,
}: {
  lessonId: string
  prompt: string
  onOpen: () => void
}) {
  const t = useTranslations('lessonWork')
  const f = useInstantFormat()
  const { data: work } = useSuspenseQuery(lessonWorkQuery(lessonId))
  const submission = work.submission
  const firstLine = prompt.trim().split('\n')[0] ?? ''

  const status = !submission
    ? { text: t('card.notStarted'), tone: 'text-muted-foreground' }
    : submission.status === 'draft'
      ? {
          text: t('card.draftSaved', { time: f.time(submission.updatedAt) }),
          tone: 'text-muted-foreground',
        }
      : submission.status === 'submitted'
        ? {
            text: t('card.submitted', {
              date: f.date(submission.submittedAt ?? submission.updatedAt),
            }),
            tone: 'text-primary',
          }
        : submission.status === 'needs_redo'
          ? { text: t('card.needsRedo'), tone: 'text-warning-foreground' }
          : { text: t('card.reviewed'), tone: 'text-success' }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-3xl border bg-card p-5 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ClipboardList className="size-6 shrink-0 text-primary" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold">{t('assignmentCard', { prompt: firstLine })}</span>
        <span className={cn('text-sm font-medium', status.tone)}>{status.text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}
