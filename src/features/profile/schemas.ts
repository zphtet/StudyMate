import { z } from 'zod'
import {
  displayNameSchema,
  localeSchema,
  newPasswordSchema,
  timezoneSchema,
} from '@/features/auth/schemas'
import { colorModes, fontIds, textSizes, themeIds } from '@/lib/appearance'

// Profile and account forms (spec 001 User Story 3) + appearance (spec 007).

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    timezone: timezoneSchema.optional(),
    locale: localeSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'invalid_input' })
export type UpdateProfileInput = z.input<typeof updateProfileSchema>

/**
 * Spec 007 contracts/server-actions.md › saveAppearance: any of mode, theme, font and text size, at
 * least one (data-model.md Profile.color_mode, Profile.theme_id, Profile.font_id, Profile.font_scale).
 */
export const saveAppearanceSchema = z
  .object({
    colorMode: z.enum(colorModes).optional(),
    themeId: z.enum(themeIds).optional(),
    fontId: z.enum(fontIds).optional(),
    textSize: z.enum(textSizes).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'invalid_input' })
export type SaveAppearanceInput = z.input<typeof saveAppearanceSchema>

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
