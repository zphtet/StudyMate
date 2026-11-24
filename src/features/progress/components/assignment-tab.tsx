'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Info, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Markdown } from '@/components/shared/markdown'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { lessonWorkQuery } from '../queries'
import { canStudentEdit } from '../submission-status'
import { AssignmentEditor } from './assignment-editor'
import { CommentList } from './comment-list'
import { SubmissionStatusChip } from './submission-status-chip'
import { SyncPill } from '@/components/shared/sync-pill'
import { submissionKey } from '../offline'
import { SubmissionView } from './submission-view'

// The student's Assignment tab (spec 004 US1 scenario 2, US2; contracts/ui-routes.md › Lesson): the
// prompt, then the editor while the answer is editable, or the sent answer read-only. Review comments
// follow; Needs redo puts "{admin} asked for a redo" above the editor.

export function AssignmentTab({
  lessonId,
  prompt,
  showSubmitBanner,
}: {
  lessonId: string
  prompt: string
  /** After Mark complete on a "submit before complete" lesson (US1 scenario 2). */
  showSubmitBanner: boolean
}) {
  const t = useTranslations('submission')
  const tw = useTranslations('lessonWork')
  const f = useInstantFormat()
  const { data: work } = useSuspenseQuery(lessonWorkQuery(lessonId))
  const { submission } = work
  const editable = canStudentEdit(submission?.status ?? null)
  const feedback = work.reviewComments.length > 0 && (
    <section aria-labelledby="feedback-heading" className="flex flex-col gap-3">
      <h2 id="feedback-heading" className="font-semibold">
        {t('feedback')}
      </h2>
      <CommentList comments={work.reviewComments} label={t('feedback')} />
    </section>
  )

  return (
    <div className="flex flex-col gap-4">
      {showSubmitBanner && editable && (
        <Banner icon={<Info className="mt-0.5 size-5 shrink-0" aria-hidden />}>
          {tw('submitToComplete')}
        </Banner>
      )}
      <Markdown source={prompt} />

      {editable ? (
        <>
          {submission?.status === 'needs_redo' && (
            <>
              <Banner icon={<RotateCcw className="mt-0.5 size-5 shrink-0" aria-hidden />}>
                {work.adminName ? t('redo', { admin: work.adminName }) : t('redoNoName')}
              </Banner>
              {feedback}
            </>
          )}
          {/* Starts from the stored answer each time it mounts: a redo arrives while it is read-only. */}
          <AssignmentEditor
            lessonId={lessonId}
            studentId={work.studentId}
            submission={submission}
          />
        </>
      ) : (
        submission && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SubmissionStatusChip status={submission.status} />
              {submission.submittedAt && (
                <span className="text-sm text-muted-foreground">
                  {/* The chip already says "Submitted". */}
                  {submission.status === 'submitted'
                    ? f.dayTime(submission.submittedAt)
                    : t('submittedAt', { date: f.dayTime(submission.submittedAt) })}
                </span>
              )}
              {/* Submitted offline (spec 008 US2 scenario 3): "Will submit" until it syncs. */}
              <SyncPill recordKey={submissionKey(lessonId)} />
            </div>
            <SubmissionView bodyMd={submission.bodyMd} attachments={submission.attachments} />
            {feedback}
          </>
        )
      )}
    </div>
  )
}

function Banner({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning p-4 font-medium text-warning-foreground"
    >
      {icon}
      {children}
    </p>
  )
}
