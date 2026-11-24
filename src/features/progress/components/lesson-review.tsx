'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, ChevronLeft, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Markdown } from '@/components/shared/markdown'
import { useTimeBoth } from '@/components/shared/time-both'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { instantOf, useRealtimeInvalidate } from '@/lib/realtime'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { reviewSubmission } from '../actions'
import { adminLessonReviewQuery, adminProgressKeys, lessonWorkKeys } from '../queries'
import type { AdminLessonReview } from '../types'
import { CommentList } from './comment-list'
import { NotesThread } from './notes-thread'
import { ReviewBar } from './review-bar'
import { SubmissionStatusChip } from './submission-status-chip'
import { SubmissionView } from './submission-view'

// The Admin's screen for one student's lesson (contracts/ui-routes.md › Lesson review; 10-Lesson
// layout): header, the Assignment tab with the submission and the review, the Notes tab and Mark done /
// Reopen. The student's resubmits and notes arrive live (research.md R10).

const triggerClass = 'min-h-11 flex-1 text-muted-foreground'

export function LessonReview({ studentId, lessonId }: { studentId: string; lessonId: string }) {
  const t = useTranslations('adminStudents')
  const tw = useTranslations('lessonWork')
  const tn = useTranslations('notes')
  const { data } = useSuspenseQuery(adminLessonReviewQuery(studentId, lessonId))
  const { student, lesson } = data
  const reviewKey = adminProgressKeys.lesson(studentId, lessonId)

  useLiveReview(studentId, lessonId)

  return (
    <>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 pt-5">
          <div className="flex items-center gap-2">
            <Link
              href={`/a/students/${student.id}`}
              aria-label={t('backToStudent', { name: student.displayName })}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </Link>
            <p className="min-w-0 truncate text-muted-foreground">
              {t('lessonPosition', {
                student: student.displayName,
                course: lesson.courseTitle,
                number: lesson.number,
                total: lesson.total,
              })}
            </p>
          </div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{lesson.title}</h1>
        </header>

        <Tabs defaultValue="assignment">
          <TabsList className="w-full group-data-horizontal/tabs:h-12">
            <TabsTrigger value="assignment" className={triggerClass}>
              {t('assignment')}
            </TabsTrigger>
            <TabsTrigger value="notes" className={triggerClass}>
              {data.notesCount > 0
                ? tw('tabs.notesCount', { count: data.notesCount })
                : tw('tabs.notes')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assignment" className="flex flex-col gap-4 pt-4">
            {lesson.assignmentPrompt ? (
              <>
                <Prompt source={lesson.assignmentPrompt} />
                {data.submission ? (
                  <Submission review={data} />
                ) : (
                  <p className="text-muted-foreground">
                    {t('noSubmission', { name: student.displayName })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('noAssignment')}</p>
            )}
          </TabsContent>
          <TabsContent value="notes" className="pt-4">
            <NotesThread
              lessonId={lesson.id}
              studentId={student.id}
              asAdmin
              emptyText={tn('emptyAdmin', { student: student.displayName })}
              countKey={reviewKey}
            />
          </TabsContent>
        </Tabs>
      </div>
      <ReviewBar review={data} />
    </>
  )
}

/**
 * The student's resubmits and Notes on this lesson (research.md R10). Edits to a Needs redo answer and
 * the Admin's own writes don't refetch: the first aren't sent yet, the second are already on screen.
 */
function useLiveReview(studentId: string, lessonId: string) {
  const queryClient = useQueryClient()
  const reviewKey = adminProgressKeys.lesson(studentId, lessonId)
  const stored = () => queryClient.getQueryData<AdminLessonReview>(reviewKey)?.submission ?? null
  const filter = `student_id=eq.${studentId}`
  const queryKeys = [reviewKey, lessonWorkKeys.notes(lessonId, studentId)]
  useRealtimeInvalidate({
    table: 'submissions',
    filter,
    queryKeys,
    when: (row) =>
      row.lesson_id === lessonId &&
      row.status === 'submitted' &&
      instantOf(row.submitted_at) !== instantOf(stored()?.submittedAt),
  })
  useRealtimeInvalidate({
    table: 'comments',
    filter,
    queryKeys,
    when: (row) => row.author_id === studentId && row.target_id === lessonId,
  })
}

/** The prompt, collapsed to 3 lines with "Show more" when it is long. */
function Prompt({ source }: { source: string }) {
  const t = useTranslations('adminStudents')
  const [open, setOpen] = useState(false)
  const id = useId()
  const long = source.split('\n').length > 3 || source.length > 240
  return (
    <div className="flex flex-col items-start gap-1">
      <div id={id} className={long && !open ? 'line-clamp-3' : undefined}>
        <Markdown source={source} />
      </div>
      {long && (
        <Button
          variant="link"
          size="touch"
          className="px-0"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? t('showLess') : t('showMore')}
        </Button>
      )}
    </div>
  )
}

/** The sent answer, its review comments and the review form (US2 scenario 3). */
function Submission({ review }: { review: AdminLessonReview }) {
  const t = useTranslations('adminStudents')
  const ts = useTranslations('submission')
  const timeBoth = useTimeBoth()
  const submission = review.submission
  if (!submission) return null
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SubmissionStatusChip status={submission.status} />
        <span className="text-sm text-muted-foreground">
          {/* The chip already says "Submitted". */}
          {submission.status === 'submitted'
            ? timeBoth(submission.submittedAt, review.student.timezone)
            : t('submittedAt', {
                date: timeBoth(submission.submittedAt, review.student.timezone),
              })}
        </span>
      </div>
      <SubmissionView bodyMd={submission.bodyMd} attachments={submission.attachments} />
      {review.reviewComments.length > 0 && (
        <CommentList comments={review.reviewComments} label={ts('feedback')} />
      )}
      <ReviewForm review={review} submissionId={submission.id} />
    </>
  )
}

function ReviewForm({ review, submissionId }: { review: AdminLessonReview; submissionId: string }) {
  const t = useTranslations('adminStudents')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const id = useId()
  const [comment, setComment] = useState('')
  const key = adminProgressKeys.lesson(review.student.id, review.lesson.id)
  // Reviewing needs the server (spec 008 R14).
  const connection = useNeedsConnection()

  const decide = useMutation({
    mutationFn: async (status: 'reviewed' | 'needs_redo') =>
      unwrap(
        await reviewSubmission({
          submissionId,
          status,
          ...(comment.trim() && { comment: comment.trim() }),
        }),
      ),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<AdminLessonReview>(key)
      queryClient.setQueryData<AdminLessonReview>(key, (old) =>
        old?.submission ? { ...old, submission: { ...old.submission, status } } : old,
      )
      return { snapshot }
    },
    onSuccess: () => setComment(''),
    onError: (error, _status, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot)
      toast.error(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminProgressKeys.all }),
  })

  return (
    <section aria-label={t('review')} className="flex flex-col gap-3">
      <label htmlFor={id} className="font-semibold">
        {t('commentLabel', { name: review.student.displayName })}
      </label>
      <Textarea
        id={id}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={t('commentPlaceholder')}
        maxLength={2000}
        rows={3}
        className="min-h-24 rounded-2xl bg-card px-4 py-3"
      />
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="xl"
          className="border-warning-border text-warning-foreground"
          disabled={connection.disabled || decide.isPending}
          aria-describedby={connection.describedBy}
          onClick={() => decide.mutate('needs_redo')}
        >
          <RotateCcw aria-hidden />
          {t('needsRedo')}
        </Button>
        <Button
          size="xl"
          disabled={connection.disabled || decide.isPending}
          aria-describedby={connection.describedBy}
          onClick={() => decide.mutate('reviewed')}
        >
          <Check aria-hidden />
          {t('reviewed')}
        </Button>
      </div>
    </section>
  )
}
