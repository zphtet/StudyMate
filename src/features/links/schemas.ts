import { z } from 'zod'

// Joining an admin (spec 001 User Story 2; contracts/server-actions.md › links).

/**
 * data-model.md AdminInvite.code. Anything that can't be a code is "Code not found" (US2 scenario 4),
 * so a typo and a replaced code read the same.
 */
export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, { error: 'code_not_found' })

export const requestJoinSchema = z.object({ code: inviteCodeSchema })

export const respondToRequestSchema = z.object({ linkId: z.uuid(), approve: z.boolean() })

/** By student, not link id: the admin's student screens know the student (contract note). */
export const removeStudentSchema = z.object({ studentId: z.uuid() })

export const dismissNoticeSchema = z.object({ id: z.uuid() })

export const noInputSchema = z.object({})
