import { Suspense } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Screen } from '@/components/layout/screen'
import { NewShiftEditor } from '@/features/shifts/components/shift-editor'
import { SeedShiftEditor } from '@/features/shifts/components/with-shifts'

// Add shift (screen 08-ShiftEdit; spec 005 US1): `?date=YYYY-MM-DD`, default today in the student's
// zone. Full screen, no tab bar.
type SearchParams = Promise<{ date?: string | string[] }>

export default function NewShiftPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Screen>
      <Suspense fallback={<PageSkeleton header={false} />}>
        <NewShift searchParams={searchParams} />
      </Suspense>
    </Screen>
  )
}

async function NewShift({ searchParams }: { searchParams: SearchParams }) {
  const { date } = await searchParams
  return (
    <SeedShiftEditor date={typeof date === 'string' ? date : undefined}>
      {({ timeZone, date: day }) => <NewShiftEditor timeZone={timeZone} date={day} />}
    </SeedShiftEditor>
  )
}
