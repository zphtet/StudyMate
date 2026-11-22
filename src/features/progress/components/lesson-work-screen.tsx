'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { StudentLessonView } from '@/features/courses/components/student-lesson-view'
import { LessonBottomBar } from './lesson-bottom-bar'
import { LessonWorkTabs, type LessonTab } from './lesson-work-tabs'

// Screen 10-Lesson with spec 004's work on it: 002's header and body, the tabs around the body and the
// bottom bar. Owns the selected tab (kept in `?tab=` so reload and Back keep it) and the "submit to
// complete" banner the bottom bar raises (US1 scenario 2).

const isTab = (value: string | null): value is LessonTab =>
  value === 'lesson' || value === 'assignment'

export function LessonWorkScreen({ lessonId }: { lessonId: string }) {
  const searchParams = useSearchParams()
  const initial = searchParams.get('tab')
  const [tab, setTab] = useState<LessonTab>(isTab(initial) ? initial : 'lesson')
  const [showSubmitBanner, setShowSubmitBanner] = useState(false)

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
        wrapBody={(body, lesson) => (
          <LessonWorkTabs
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
