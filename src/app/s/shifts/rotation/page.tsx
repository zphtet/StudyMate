import { Suspense } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Screen } from '@/components/layout/screen'
import { RotationEditor } from '@/features/shifts/components/rotation-editor'
import { SeedRotationEditor } from '@/features/shifts/components/with-shifts'
import { ROTATION_LETTERS, localDateSchema } from '@/features/shifts/schemas'

// My rotation (spec 005 US2; contracts/ui-routes.md; no screenshot, 08-ShiftEdit's layout). From the
// shift editor's "Repeat: My rotation": `?start=YYYY-MM-DD&type=D|E|N|O` starts a new pattern.
type SearchParams = Promise<{ start?: string | string[]; type?: string | string[] }>

const startSchema = localDateSchema.optional().catch(undefined)
const letterSchema = z.enum(ROTATION_LETTERS).optional().catch(undefined)

export default function RotationPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Screen>
      <Suspense fallback={<PageSkeleton header={false} />}>
        <Rotation searchParams={searchParams} />
      </Suspense>
    </Screen>
  )
}

async function Rotation({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const start = startSchema.parse(params.start)
  const letter = letterSchema.parse(params.type)
  return (
    <SeedRotationEditor>
      {({ timeZone, today }) => (
        <RotationEditor timeZone={timeZone} today={today} start={start} letter={letter} />
      )}
    </SeedRotationEditor>
  )
}
