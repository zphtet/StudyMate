'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Segmented } from '@/components/shared/segmented'
import { Button } from '@/components/ui/button'
import { mondayOf, todayIn } from '@/lib/time'
import { cn } from '@/lib/utils'
import { planSelection, type PlanViewMode } from '../plan-selection'
import { linkedStudentsQuery } from '../queries'
import type { PlanCard } from '../types'
import { DeadlineSheet } from './deadline-sheet'
import { PlanMonth } from './plan-month'
import { PlanWeek } from './plan-week'

// Admin Plan (screen 22-AdminPlan; spec 003 US2, US4): "+ Deadline", student chips, the Week/Month
// toggle and the week or month. State lives in the URL (?student=<id>&view=month&week=<monday>&
// month=<YYYY-MM>) so Back and reload work (research R10). Defaults: the first linked student by
// name, the week view, this week or month in that student's zone.

export function PlanView() {
  const t = useTranslations('plan')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: students } = useSuspenseQuery(linkedStudentsQuery)
  const { student, view, week, month } = planSelection(students, new URLSearchParams(params))
  const [sheet, setSheet] = useState<{ open: boolean; editing: PlanCard | null }>({
    open: false,
    editing: null,
  })

  const navigate = (next: Record<string, string | null>) => {
    const query = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value === null) query.delete(key)
      else query.set(key, value)
    }
    router.replace(`${pathname}?${query}`, { scroll: false })
  }
  // Month opens on the month of the week on screen.
  const showView = (next: PlanViewMode) =>
    student &&
    navigate(
      next === 'month'
        ? { view: 'month', month: (week ?? mondayOf(todayIn(student.timezone))).slice(0, 7) }
        : { view: null },
    )

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={t('title')}
        actions={
          student && (
            <Button
              size="touch"
              className="rounded-2xl px-5"
              onClick={() => setSheet({ open: true, editing: null })}
            >
              <Plus aria-hidden /> {t('addDeadline')}
            </Button>
          )
        }
      />
      {!student ? (
        <EmptyState icon={Users} title={t('noStudents')}>
          <Link href="/a/students" className="font-medium text-primary underline">
            {t('noStudentsLink')}
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label={t('students')}
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
            >
              {students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === student.id}
                  onClick={() => navigate({ student: s.id, week: null, month: null })}
                  className={cn(
                    'min-h-11 shrink-0 rounded-full border px-5 font-medium whitespace-nowrap',
                    s.id === student.id
                      ? 'border-inverse bg-inverse text-inverse-foreground'
                      : 'bg-card hover:bg-muted',
                  )}
                >
                  {s.displayName}
                </button>
              ))}
            </div>
            <Segmented
              name="plan-view"
              legend={t('view')}
              value={view}
              options={[
                { value: 'week', label: t('week') },
                { value: 'month', label: t('month') },
              ]}
              onChange={showView}
              className="shrink-0"
            />
          </div>
          {view === 'month' ? (
            <PlanMonth
              studentId={student.id}
              month={month}
              onMonthChange={(next) => navigate({ student: student.id, month: next })}
              onSelectDay={(date) =>
                navigate({ student: student.id, view: null, week: mondayOf(date) })
              }
            />
          ) : (
            <PlanWeek
              studentId={student.id}
              week={week}
              onWeekChange={(monday) => navigate({ student: student.id, week: monday })}
              onOpen={(card) => setSheet({ open: true, editing: card })}
            />
          )}
          <DeadlineSheet
            student={student}
            editing={sheet.editing}
            open={sheet.open}
            onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
          />
        </>
      )}
    </div>
  )
}
