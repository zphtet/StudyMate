import { z } from 'zod'
import { ShiftType } from '@/generated/prisma/enums'

// Spec 005 contracts/server-actions.md › Field schemas. Shared by the forms and the Server Actions.
// Field rules: specs/005-shifts/data-model.md. Messages are `validation.*` keys (camelCase); the
// action wrapper turns them into `invalid_input` (src/lib/action.ts). Rules the editors can't break
// (more than 28 letters, a sleep length off the 30 min steps) keep Zod's default message.

const uuid = z.uuid()

/** A calendar date in the student's zone (`YYYY-MM-DD`). */
export const localDateSchema = z.iso.date({ error: 'dateInvalid' })

/** A clock time `HH:mm`. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'timeInvalid' })

/** A calendar month `YYYY-MM` (the Shifts screen's `?month=`). */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

/** data-model.md Shift.type */
export const shiftTypeSchema = z.enum(ShiftType)

// ── Shifts (research R2) ─────────────────────────────────────────────────────────────────────

/**
 * Add or edit a shift. `date` is the local date of its start; an end at or before the start is the
 * next day (lib/time.ts shiftInstants). Times are required unless the shift is Off (a whole day).
 */
export const saveShiftSchema = z
  .object({
    shiftId: uuid.optional(),
    date: localDateSchema,
    type: shiftTypeSchema,
    start: clockTimeSchema.optional(),
    end: clockTimeSchema.optional(),
    blockSleep: z.boolean(),
  })
  .refine((v) => v.type === 'off' || (v.start !== undefined && v.end !== undefined), {
    error: 'timeInvalid',
    path: ['start'],
  })
export type SaveShiftInput = z.infer<typeof saveShiftSchema>

export const deleteShiftSchema = z.object({ shiftId: uuid })

// ── Rotation (research R4) ───────────────────────────────────────────────────────────────────

/** data-model.md ShiftPattern.sequence: the database allows C; the 005 editor offers D, E, N, O only. */
export const ROTATION_LETTERS = ['D', 'E', 'N', 'O'] as const
export type RotationLetter = (typeof ROTATION_LETTERS)[number]

export const sequenceSchema = z
  .string()
  .max(28)
  .regex(/^[DENO]*$/)
  .refine((s) => /[DEN]/.test(s), { error: 'rotationEmpty' })

export const saveRotationSchema = z.object({ sequence: sequenceSchema, startDate: localDateSchema })

// ── Settings (research R3, R10) ──────────────────────────────────────────────────────────────

/** One preset: start ≠ end; an end before the start is overnight (Night 22:00–07:00). */
const presetPairSchema = z
  .tuple([clockTimeSchema, clockTimeSchema])
  .refine(([start, end]) => start !== end, { error: 'presetSameTimes' })

/** data-model.md Profile.shift_presets; also parses the stored JSON where it enters the app. */
export const shiftPresetsSchema = z.object({
  D: presetPairSchema,
  E: presetPairSchema,
  N: presetPairSchema,
})
export type ShiftPresets = z.infer<typeof shiftPresetsSchema>

/** data-model.md Profile.sleep_minutes: 4–12 h in 30 min steps. */
export const sleepMinutesSchema = z.number().int().min(240).max(720).multipleOf(30)

/** data-model.md Profile.waking_start, Profile.waking_end: start < end. */
export const shiftSettingsSchema = z
  .object({
    presets: shiftPresetsSchema,
    sleepMinutes: sleepMinutesSchema,
    wakingStart: clockTimeSchema,
    wakingEnd: clockTimeSchema,
  })
  .refine((v) => v.wakingStart < v.wakingEnd, { error: 'wakingOrder', path: ['wakingEnd'] })
export type ShiftSettingsInput = z.infer<typeof shiftSettingsSchema>
