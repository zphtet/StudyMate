'use client'

import { Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Markdown } from '@/components/shared/markdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Lesson screen tabs (screen 10-Lesson; contracts/ui-routes.md › Lesson): Lesson, and Assignment when
// the lesson has a prompt. The tab lives in the URL (`?tab=`), owned by LessonWorkScreen. US2 adds the
// editor to the Assignment tab and the Notes tab.

export type LessonTab = 'lesson' | 'assignment'

export function LessonWorkTabs({
  tab,
  onTabChange,
  assignmentPrompt,
  showSubmitBanner,
  children,
}: {
  tab: LessonTab
  onTabChange: (tab: LessonTab) => void
  assignmentPrompt: string | null
  /** After Mark complete on a "submit before complete" lesson (US1 scenario 2). */
  showSubmitBanner: boolean
  /** 002's lesson content. */
  children: ReactNode
}) {
  const t = useTranslations('lessonWork')
  const current = tab === 'assignment' && !assignmentPrompt ? 'lesson' : tab

  return (
    <Tabs value={current} onValueChange={(value) => onTabChange(value as LessonTab)}>
      <TabsList className="w-full group-data-horizontal/tabs:h-12">
        <TabsTrigger value="lesson" className="min-h-11 flex-1 text-muted-foreground">
          {t('tabs.lesson')}
        </TabsTrigger>
        {assignmentPrompt && (
          <TabsTrigger value="assignment" className="min-h-11 flex-1 text-muted-foreground">
            {t('tabs.assignment')}
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="lesson" className="pt-4">
        {children}
      </TabsContent>
      {assignmentPrompt && (
        <TabsContent value="assignment" className="flex flex-col gap-4 pt-4">
          {showSubmitBanner && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning p-4 font-medium text-warning-foreground"
            >
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
              {t('submitToComplete')}
            </p>
          )}
          <Markdown source={assignmentPrompt} />
        </TabsContent>
      )}
    </Tabs>
  )
}
