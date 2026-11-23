'use server'

import { z } from 'zod'
import { action } from '@/lib/action'
import { requireRole } from '@/server/auth/guards'
import * as repo from './repo'
import * as rotationRepo from './rotation-repo'
import {
  deleteShiftSchema,
  saveRotationSchema,
  saveShiftSchema,
  shiftPresetsSchema,
  shiftSettingsSchema,
} from './schemas'

// Spec 005 writes (specs/005-shifts/contracts/server-actions.md). Each starts with its guard; the
// student id always comes from the guard, never from the input (data-model.md Shift.student_id).

/** US1: add or edit a shift. shift_overlap, shift_too_long, shift_not_found (research R2). */
export const saveShift = action(saveShiftSchema, async (input) =>
  repo.saveShift(await requireRole('student'), input),
)

/** US1: a hand-entered shift is deleted; a generated one becomes an Off day (research R4). */
export const deleteShift = action(deleteShiftSchema, async ({ shiftId }) =>
  repo.deleteShift(await requireRole('student'), shiftId),
)

/**
 * FR-002–FR-004: preset times, sleep length, waking hours (research R10). New preset times or a new
 * sleep length also reach the active rotation's untouched future shifts (spec Edge Cases).
 */
export const saveShiftSettings = action(shiftSettingsSchema, async (input) => {
  const me = await requireRole('student')
  const before = shiftPresetsSchema.safeParse(me.shiftPresets)
  const isRotationChanged =
    me.sleepMinutes !== input.sleepMinutes ||
    !before.success ||
    JSON.stringify(before.data) !== JSON.stringify(input.presets)
  const result = await repo.saveShiftSettings(me, input)
  if (isRotationChanged) await rotationRepo.regenerateFuture(me)
  return result
})

/** US2 scenario 1; FR-010: replaces the active rotation (FR-007). Returns the skipped days. */
export const saveRotation = action(saveRotationSchema, async (input) =>
  rotationRepo.saveRotation(await requireRole('student'), input),
)

/** US2 scenario 4: rotation_not_found when there is none. */
export const deleteRotation = action(z.object({}), async () =>
  rotationRepo.deleteRotation(await requireRole('student')),
)

/** FR-009: Confirm and Edit on the Sunday check; stays dismissed on every device. */
export const confirmShiftWeek = action(z.object({}), async () =>
  rotationRepo.confirmShiftWeek(await requireRole('student')),
)
