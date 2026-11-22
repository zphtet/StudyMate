'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Markdown } from '@/components/shared/markdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminLessonReviewQuery } from '../queries'
import { ReviewBar } from './review-bar'

// The Admin's screen for one student's lesson (contracts/ui-routes.md › Lesson review; 10-Lesson
// layout): header, the Assignment tab and Mark done / Reopen. US2 adds the submission, the review and
// the Notes tab.

export function LessonReview({ studentId, lessonId }: { studentId: string; lessonId: string }) {
  const t = useTranslations('adminStudents')
  const { data } = useSuspenseQuery(adminLessonReviewQuery(studentId, lessonId))
  const { student, lesson } = data

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
            <TabsTrigger value="assignment" className="min-h-11 flex-1 text-muted-foreground">
              {t('assignment')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assignment" className="flex flex-col gap-4 pt-4">
            {lesson.assignmentPrompt ? (
              <>
                <Markdown source={lesson.assignmentPrompt} />
                {!data.submission && (
                  <p className="text-muted-foreground">
                    {t('noSubmission', { name: student.displayName })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('noAssignment')}</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <ReviewBar review={data} />
    </>
  )
}
