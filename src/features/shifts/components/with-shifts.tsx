import 'server-only'
import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { NotFound } from '@/lib/http'
import { Prefetched } from '@/lib/query/prefetch'
import { todayIn } from '@/lib/time'
import { requirePageUser } from '@/server/auth/page-guard'
import { monthShiftsQuery, shiftQuery, shiftSettingsQuery, shiftsTodayQuery } from '../queries'
import { getMonthShifts, getShift, getShiftSettings, getShiftsToday } from '../repo'
import { localDateSchema, monthSchema } from '../schemas'

// Server-side seeds for the Shifts screens (spec 005 US1): the same data and guard as the Route
// Handlers, read with the caller's id and zone (the /s layout already checked the role).

/** The Shifts screen: the month (`?month=`, default the student's current month) and settings. */
export async function SeedShiftsMonth({
  month: requested,
  children,
}: {
  month: string | undefined
  children: (month: string) => ReactNode
}) {
  const me = await requirePageUser()
  const month = monthSchema.catch(todayIn(me.timezone).slice(0, 7)).parse(requested)
  const [data, settings, today] = await Promise.all([
    getMonthShifts(me, month),
    getShiftSettings(me),
    getShiftsToday(me),
  ])
  return (
    <Prefetched
      entries={[
        [monthShiftsQuery(month).queryKey, data],
        [shiftSettingsQuery.queryKey, settings],
        [shiftsTodayQuery.queryKey, today],
      ]}
    >
      {children(month)}
    </Prefetched>
  )
}

/** The shift editor: settings (presets, sleep) and, when editing, the shift; the student's zone. */
export async function SeedShiftEditor({
  shiftId,
  date: requested,
  children,
}: {
  shiftId?: string
  date?: string
  children: (props: { timeZone: string; date: string }) => ReactNode
}) {
  const me = await requirePageUser()
  const [settings, existing] = await Promise.all([
    getShiftSettings(me),
    shiftId ? getShift(me, shiftId).catch(notFoundOnMissing) : null,
  ])
  const date = localDateSchema.catch(todayIn(me.timezone)).parse(requested)
  return (
    <Prefetched
      entries={[
        [shiftSettingsQuery.queryKey, settings],
        ...(existing && shiftId
          ? [[shiftQuery(shiftId).queryKey, existing] as [readonly unknown[], unknown]]
          : []),
      ]}
    >
      {children({ timeZone: me.timezone, date })}
    </Prefetched>
  )
}

function notFoundOnMissing(error: unknown): never {
  if (error instanceof NotFound) notFound()
  throw error
}

/** The rotation editor: settings (presets, the active rotation), the student's zone and today. */
export async function SeedRotationEditor({
  children,
}: {
  children: (props: { timeZone: string; today: string }) => ReactNode
}) {
  const me = await requirePageUser()
  const settings = await getShiftSettings(me)
  return (
    <Prefetched entries={[[shiftSettingsQuery.queryKey, settings]]}>
      {children({ timeZone: me.timezone, today: todayIn(me.timezone) })}
    </Prefetched>
  )
}

/** Today's shift banner and Sunday check, and Me's Shift calendar row: seeded with the page. */
export function WithShiftsToday({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SeedShiftsToday>{children}</SeedShiftsToday>
    </Suspense>
  )
}

async function SeedShiftsToday({ children }: { children: ReactNode }) {
  const today = await getShiftsToday(await requirePageUser())
  return <Prefetched entries={[[shiftsTodayQuery.queryKey, today]]}>{children}</Prefetched>
}
