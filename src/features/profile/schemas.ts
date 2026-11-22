import { z } from 'zod'
import {
  displayNameSchema,
  localeSchema,
  newPasswordSchema,
  timezoneSchema,
} from '@/features/auth/schemas'

// Profile and account forms (spec 001 User Story 3) + colour mode (spec 007 FR-001, pulled forward).

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    timezone: timezoneSchema.optional(),
    locale: localeSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'invalid_input' })
export type UpdateProfileInput = z.input<typeof updateProfileSchema>

export const colorModes = ['light', 'dark', 'system'] as const
export type ColorMode = (typeof colorModes)[number]
export const colorModeSchema = z.object({ colorMode: z.enum(colorModes) })

/** Spec 004 FR-008; data-model.md Profile.weekly_goal_days (database CHECK 1..7). */
export const weeklyGoalSchema = z.object({ days: z.number().int().min(1).max(7) })

export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE', { error: 'confirm_mismatch' }),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: 'passwordRequired' }).max(72),
  newPassword: newPasswordSchema,
})
export type ChangePasswordInput = z.input<typeof changePasswordSchema>
