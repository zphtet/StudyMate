'use client'

import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { StudentLessonView } from '@/features/courses/components/student-lesson-view'
import { instantOf, useRealtimeInvalidate, type ChangedRow } from '@/lib/realtime'
import { lessonWorkKeys, lessonWorkQuery } from '../queries'
import type { LessonWork, SubmissionView } from '../types'
import { LessonBottomBar } from './lesson-bottom-bar'
import { LessonWorkTabs, type LessonTab } from './lesson-work-tabs'

// Screen 10-Lesson with spec 004's work on it: 002's header and body, the tabs around the body and the
// bottom bar. Owns the selected tab (kept in `?tab=` so reload and Back keep it) and the "submit to
// complete" banner the bottom bar raises (US1 scenario 2). The Admin's review and Notes arrive live
// (research.md R10).

const isTab = (value: string | null): value is LessonTab =>
  value === 'lesson' || value === 'assignment' || value === 'notes'

export function LessonWorkScreen({ lessonId }: { lessonId: string }) {
  const searchParams = useSearchParams()
  const initial = searchParams.get('tab')
  const [tab, setTab] = useState<LessonTab>(isTab(initial) ? initial : 'lesson')
  const [showSubmitBanner, setShowSubmitBanner] = useState(false)
  const { data: work } = useSuspenseQuery(lessonWorkQuery(lessonId))
  useLiveWork(lessonId, work.studentId)

  const selectTab = (next: LessonTab) => {
    setTab(next)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', next)
    window.history.replaceState(null, '', `?${params}`)
  }

  return (
    <>
      <StudentLessonView
        lessonId={lessonId}
        showAssignment={false}
        wrapBody={(body, lesson) => (
          <LessonWorkTabs
            lessonId={lessonId}
            tab={tab}
            onTabChange={selectTab}
            assignmentPrompt={lesson.assignmentPrompt}
            showSubmitBanner={showSubmitBanner}
          >
            {body}
          </LessonWorkTabs>
        )}
      />
      <LessonBottomBar
        lessonId={lessonId}
        onSubmissionRequired={() => {
          setShowSubmitBanner(true)
          selectTab('assignment')
        }}
      />
    </>
  )
}

/**
 * The Admin's review and Notes on this lesson (research.md R10). The student's own autosaves and posts
 * also send events on this channel; those are already on screen, so they don't refetch.
 */
function useLiveWork(lessonId: string, studentId: string) {
  const queryClient = useQueryClient()
  const workKey = lessonWorkKeys.work(lessonId)
  const stored = () => queryClient.getQueryData<LessonWork>(workKey)?.submission ?? null
  const filter = `student_id=eq.${studentId}`
  const queryKeys = [workKey, lessonWorkKeys.notes(lessonId, studentId)]
  useRealtimeInvalidate({
    table: 'submissions',
    filter,
    queryKeys,
    when: (row) => row.lesson_id === lessonId && isReviewChange(row, stored()),
  })
  useRealtimeInvalidate({
    table: 'comments',
    filter,
    queryKeys,
    when: (row) =>
      row.author_id !== studentId && (row.target_id === lessonId || row.target_id === stored()?.id),
  })
}

/**
 * Only the Admin moves an answer to Reviewed or Needs redo, and each review sets reviewed_at. The
 * student's own saves and submits never pass, even when they arrive before the action's reply.
 */
const isReviewChange = (row: ChangedRow, stored: SubmissionView | null) =>
  (row.status === 'reviewed' || row.status === 'needs_redo') &&
  (row.status !== stored?.status || instantOf(row.reviewed_at) !== instantOf(stored?.reviewedAt))
