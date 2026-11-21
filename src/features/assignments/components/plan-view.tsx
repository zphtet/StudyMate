'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { planSelection } from '../plan-selection'
import { linkedStudentsQuery } from '../queries'
import type { PlanCard } from '../types'
import { DeadlineSheet } from './deadline-sheet'
import { PlanWeek } from './plan-week'

// Admin Plan (screen 22-AdminPlan; spec 003 US2): "+ Deadline", student chips and the week. State
// lives in the URL (?student=<id>&week=<monday>) so Back and reload work (research R10). Defaults:
// the first linked student by name, this week in that student's zone.

export function PlanView() {
  const t = useTranslations('plan')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: students } = useSuspenseQuery(linkedStudentsQuery)
  const { student, week } = planSelection(students, new URLSearchParams(params))
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
          <div role="group" aria-label={t('students')} className="flex gap-2 overflow-x-auto pb-1">
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === student.id}
                onClick={() => navigate({ student: s.id, week: null })}
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
          <PlanWeek
            studentId={student.id}
            week={week}
            onWeekChange={(monday) => navigate({ student: student.id, week: monday })}
            onOpen={(card) => setSheet({ open: true, editing: card })}
          />
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
