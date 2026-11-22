import { Suspense } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { ProgressView } from '@/features/progress/components/progress-view'
import { WithProgress } from '@/features/progress/components/with-progress'

// Student Progress (screen 06-Progress; spec 004 US3). `?view=week|month`, Month by default.
const viewSchema = z.enum(['month', 'week']).catch('month')

type SearchParams = Promise<{ view?: string | string[] }>

export default function ProgressPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Progress searchParams={searchParams} />
    </Suspense>
  )
}

async function Progress({ searchParams }: { searchParams: SearchParams }) {
  const view = viewSchema.parse((await searchParams).view)
  return (
    <WithProgress view={view}>
      <ProgressView view={view} />
    </WithProgress>
  )
}
