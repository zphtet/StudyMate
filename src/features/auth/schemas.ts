import { z } from 'zod'
import { isTimeZone, locales } from '@/i18n/locales'

// Shared by the forms (react-hook-form + zodResolver) and the Server Actions (research R10).
// Error messages are keys under `validation.*` in src/i18n/messages.

export const roleSchema = z.enum(['student', 'admin'])
export type Role = z.infer<typeof roleSchema>

export const localeSchema = z.enum(locales)

/** data-model.md › Profile.displayName: 1–60 characters after trimming. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'nameRequired' })
  .max(60, { error: 'nameTooLong' })

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'emailInvalid' }).max(254, { error: 'emailInvalid' }))

/** FR-013: at least 8 characters with a letter and a digit (matches the Supabase Auth setting). */
export const newPasswordSchema = z
  .string()
  .min(8, { error: 'passwordWeak' })
  .max(72, { error: 'passwordWeak' })
  .regex(/[A-Za-z]/, { error: 'passwordWeak' })
  .regex(/\d/, { error: 'passwordWeak' })

/** data-model.md › Profile.timezone: a valid IANA zone. */
export const timezoneSchema = z.string().refine(isTimeZone, { error: 'timezoneInvalid' })

export const codeSchema = z.string().regex(/^\d{6}$/, { error: 'codeIncomplete' })

export const signUpSchema = z.object({
  role: roleSchema,
  displayName: displayNameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  timezone: timezoneSchema,
  locale: localeSchema,
})
export type SignUpInput = z.input<typeof signUpSchema>

export const signInSchema = z.object({
  role: roleSchema,
  email: emailSchema,
  password: z.string().min(1, { error: 'passwordRequired' }).max(72),
})
export type SignInInput = z.input<typeof signInSchema>

export const verifyEmailSchema = z.object({ email: emailSchema, code: codeSchema })
export const emailOnlySchema = z.object({ email: emailSchema })
export const setLocaleSchema = z.object({ locale: localeSchema })

/** User Story 5 scenarios 2 and 4: the code, and the new password typed twice. */
export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: codeSchema,
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: 'passwords_differ', path: ['confirm'] })
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>
