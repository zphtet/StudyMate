import { Suspense } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { getPlanMonth, getPlanWeek } from '../plan-repo'
import { planSelection } from '../plan-selection'
import { linkedStudentsQuery, planMonthQuery, planWeekQuery } from '../queries'
import { listLinkedStudents } from '../repo'
import { PlanView } from './plan-view'

// Server-side seed for the admin Plan (spec 003 US2, US4): the linked students and the selected week
// or month, with the same defaults as the client (the /a layout already checked the role).

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export function PlanScreen({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedPlan searchParams={searchParams} />
    </Suspense>
  )
}

async function SeedPlan({ searchParams }: { searchParams: SearchParams }) {
  const me = await requirePageUser()
  const students = await listLinkedStudents(me.id)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value)
  }
  const { student, view, week, month } = planSelection(students, params)
  const entries: [readonly unknown[], unknown][] = [[linkedStudentsQuery.queryKey, students]]
  if (student && view === 'month') {
    const plan = await getPlanMonth({ admin: me, studentId: student.id, month })
    entries.push([planMonthQuery(student.id, month).queryKey, plan])
  } else if (student) {
    const plan = await getPlanWeek({ admin: me, studentId: student.id, student, week })
    entries.push([planWeekQuery(student.id, week).queryKey, plan])
  }
  return (
    <Prefetched entries={entries}>
      <PlanView />
    </Prefetched>
  )
}
