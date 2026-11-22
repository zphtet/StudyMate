'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { lessonWorkKeys, lessonWorkQuery } from '../queries'
import { AssignmentCard } from './assignment-card'
import { AssignmentTab } from './assignment-tab'
import { NotesThread } from './notes-thread'

// Lesson screen tabs (screen 10-Lesson; contracts/ui-routes.md › Lesson): Lesson (002's content and the
// assignment card), Assignment when the lesson has a prompt, and Notes · n. The tab lives in the URL
// (`?tab=`), owned by LessonWorkScreen.

export type LessonTab = 'lesson' | 'assignment' | 'notes'

const triggerClass = 'min-h-11 flex-1 text-muted-foreground'

export function LessonWorkTabs({
  lessonId,
  tab,
  onTabChange,
  assignmentPrompt,
  showSubmitBanner,
  children,
}: {
  lessonId: string
  tab: LessonTab
  onTabChange: (tab: LessonTab) => void
  assignmentPrompt: string | null
  /** After Mark complete on a "submit before complete" lesson (US1 scenario 2). */
  showSubmitBanner: boolean
  /** 002's lesson content. */
  children: ReactNode
}) {
  const t = useTranslations('lessonWork')
  const tn = useTranslations('notes')
  const { data: work } = useSuspenseQuery(lessonWorkQuery(lessonId))
  const current = tab === 'assignment' && !assignmentPrompt ? 'lesson' : tab

  return (
    <Tabs value={current} onValueChange={(value) => onTabChange(value as LessonTab)}>
      <TabsList className="w-full group-data-horizontal/tabs:h-12">
        <TabsTrigger value="lesson" className={triggerClass}>
          {t('tabs.lesson')}
        </TabsTrigger>
        {assignmentPrompt && (
          <TabsTrigger value="assignment" className={triggerClass}>
            {t('tabs.assignment')}
          </TabsTrigger>
        )}
        <TabsTrigger value="notes" className={triggerClass}>
          {work.notesCount > 0 ? t('tabs.notesCount', { count: work.notesCount }) : t('tabs.notes')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="lesson" className="flex flex-col gap-6 pt-4">
        {children}
        {assignmentPrompt && (
          <AssignmentCard
            lessonId={lessonId}
            prompt={assignmentPrompt}
            onOpen={() => onTabChange('assignment')}
          />
        )}
      </TabsContent>
      {assignmentPrompt && (
        <TabsContent value="assignment" className="pt-4">
          <AssignmentTab
            lessonId={lessonId}
            prompt={assignmentPrompt}
            showSubmitBanner={showSubmitBanner}
          />
        </TabsContent>
      )}
      <TabsContent value="notes" className="pt-4">
        <NotesThread
          lessonId={lessonId}
          studentId={work.studentId}
          asAdmin={false}
          emptyText={
            work.adminName
              ? tn('emptyStudent', { admin: work.adminName })
              : tn('emptyStudentNoAdmin')
          }
          countKey={lessonWorkKeys.work(lessonId)}
        />
      </TabsContent>
    </Tabs>
  )
}
