'use client'

import type { QueryClient } from '@tanstack/react-query'
import { enqueue } from '@/lib/offline/outbox'
import { outboxUserId } from '@/lib/offline/sync'
import { ActionResultError } from '@/lib/result'
import { shiftInstants } from '@/lib/time'
import { findLocalOverlap } from './overlap'
import { shiftKeys } from './queries'
import type { SaveShiftInput } from './schemas'
import type { MonthShifts, ShiftView } from './types'

// Shift changes a student can make offline (spec 008 FR-003, clarification Q5; research R5, R7): add,
// edit or delete one shift. Rotations aren't queued. A shift added offline shows at once with a
// local id and "Will sync"; it gets its real id when it syncs.

const LOCAL_PREFIX = 'local:'

export const shiftKey = (shiftId: string) => `shift:${shiftId}`
export const isLocalShift = (shiftId: string) => shiftId.startsWith(LOCAL_PREFIX)

/** Every shift in the cached months, once each: what the device checks a new shift against. */
function cachedShifts(queryClient: QueryClient): ShiftView[] {
  const byId = new Map<string, ShiftView>()
  for (const [, data] of queryClient.getQueriesData<MonthShifts>({
    queryKey: [...shiftKeys.all, 'month'],
  })) {
    data?.shifts.forEach((shift) => byId.set(shift.id, shift))
  }
  return [...byId.values()]
}

/** Puts the change on screen in every cached month, as the server will once it syncs. */
function showLocally(queryClient: QueryClient, change: (shifts: ShiftView[]) => ShiftView[]) {
  queryClient.setQueriesData<MonthShifts>({ queryKey: [...shiftKeys.all, 'month'] }, (old) =>
    old ? { ...old, shifts: change(old.shifts) } : old,
  )
}

function requireUser() {
  const userId = outboxUserId()
  // The sync loop starts with the student's layout; without it there is nowhere to queue.
  if (!userId) throw new ActionResultError('offline')
  return userId
}

export async function queueShiftSave({
  queryClient,
  input,
  shift,
  timeZone,
  sleepMinutes,
  label,
}: {
  queryClient: QueryClient
  input: SaveShiftInput
  /** The shift being edited; undefined for a new one. */
  shift?: ShiftView
  timeZone: string
  /** The student's sleep length, for Block sleep (spec 005). */
  sleepMinutes: number
  label: string
}) {
  const userId = requireUser()
  const isWorking = input.type !== 'off'
  const { start, end } = shiftInstants(
    isWorking && input.start !== undefined && input.end !== undefined
      ? { date: input.date, start: input.start, end: input.end }
      : { date: input.date, start: null, end: null },
    timeZone,
  )
  // The server's rule, on the shifts this device has (spec 005 FR-003); it checks again on sync.
  if (isWorking) {
    const clash = findLocalOverlap(cachedShifts(queryClient), { start, end, exceptId: shift?.id })
    if (clash)
      throw new ActionResultError('shift_overlap', { start: clash.startAt, end: clash.endAt })
  }

  const id = shift?.id ?? `${LOCAL_PREFIX}${crypto.randomUUID()}`
  const isNew = isLocalShift(id)
  await enqueue({
    userId,
    type: 'shift.save',
    recordKey: shiftKey(id),
    payload: { shift: isNew ? input : { ...input, shiftId: id } },
    base: isNew || !shift ? null : { updatedAt: shift.updatedAt },
    label,
  })

  const view: ShiftView = {
    id,
    type: input.type,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    sleepMinutes: isWorking && input.blockSleep ? sleepMinutes : 0,
    fromRotation: shift?.fromRotation ?? false,
    overridden: shift?.fromRotation ?? false,
    updatedAt: shift?.updatedAt ?? '',
  }
  showLocally(queryClient, (shifts) =>
    [...shifts.filter((s) => s.id !== id), view].sort((a, b) => a.startAt.localeCompare(b.startAt)),
  )
  queryClient.setQueryData(shiftKeys.detail(id), { shift: view })
}

export async function queueShiftDelete({
  queryClient,
  shift,
  label,
}: {
  queryClient: QueryClient
  shift: ShiftView
  label: string
}) {
  await enqueue({
    userId: requireUser(),
    type: 'shift.delete',
    recordKey: shiftKey(shift.id),
    payload: { shiftId: shift.id },
    base: { updatedAt: shift.updatedAt },
    label,
  })
  showLocally(queryClient, (shifts) => shifts.filter((s) => s.id !== shift.id))
}
