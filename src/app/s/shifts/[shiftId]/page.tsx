import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Screen } from '@/components/layout/screen'
import { ExistingShiftEditor } from '@/features/shifts/components/shift-editor'
import { SeedShiftEditor } from '@/features/shifts/components/with-shifts'

// Edit a shift (screen 08-ShiftEdit; spec 005 US1): the same editor with Delete. Another student's
// shift, or one that no longer exists, is a 404.
type Params = Promise<{ shiftId: string }>

export default function EditShiftPage({ params }: { params: Params }) {
  return (
    <Screen>
      <Suspense fallback={<PageSkeleton header={false} />}>
        <EditShift params={params} />
      </Suspense>
    </Screen>
  )
}

async function EditShift({ params }: { params: Params }) {
  const shiftId = z.uuid().safeParse((await params).shiftId)
  if (!shiftId.success) notFound()
  return (
    <SeedShiftEditor shiftId={shiftId.data}>
      {({ timeZone }) => <ExistingShiftEditor timeZone={timeZone} shiftId={shiftId.data} />}
    </SeedShiftEditor>
  )
}
