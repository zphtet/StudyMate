import { z } from 'zod'
import { MAX_CONTENT_BYTES, utf8Bytes } from '@/features/courses/schemas'

// Spec 004 contracts/server-actions.md › Field schemas. Shared by the forms and the Server Actions.
// Field rules: specs/004-progress-assignments/data-model.md. Messages are `validation.*` keys
// (camelCase) or action error codes (snake_case), as in 002.

/** data-model.md Submission.attachments: the submissions bucket limit. */
export const MAX_IMAGE_BYTES = 2_097_152
/** data-model.md Submission.attachments: at most 5 images (FR-003). */
export const MAX_IMAGES = 5
/** data-model.md StudySession.planned_minutes */
export const FOCUS_MINUTES = [15, 25] as const

const uuid = z.uuid()

/** data-model.md Submission.attachments: one stored image. */
export const attachmentSchema = z.object({
  path: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES, { error: 'file_too_large' }),
})
export const attachmentsSchema = z
  .array(attachmentSchema)
  .max(MAX_IMAGES, { error: 'too_many_images' })

/** data-model.md Submission.body_md: the same byte limit as lesson content. */
export const bodyMdSchema = z
  .string()
  .refine((v) => utf8Bytes(v) <= MAX_CONTENT_BYTES, { error: 'content_too_long' })

/** data-model.md Comment.body (database CHECK 1..2000). */
export const commentBodySchema = z
  .string()
  .trim()
  .min(1, { error: 'commentRequired' })
  .max(2000, { error: 'commentTooLong' })

const SUBMISSION_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpe?g)$/

/**
 * data-model.md Submission.attachments: every stored path is `<studentId>/<lessonId>/<uuid>.<ext>`
 * (research.md R7). The server checks this so a draft can't point at someone else's file.
 */
export function isOwnSubmissionPath(path: string, studentId: string, lessonId: string) {
  const prefix = `${studentId}/${lessonId}/`
  return path.startsWith(prefix) && SUBMISSION_FILE.test(path.slice(prefix.length))
}

// ── Completion (research.md R1) ──────────────────────────────────────────────────────────────

export const completeLessonSchema = z.object({ lessonId: uuid })
export const undoCompletionSchema = z.object({ lessonId: uuid })
export const setLessonDoneSchema = z.object({ studentId: uuid, lessonId: uuid, done: z.boolean() })

// ── Submissions (research.md R7) ─────────────────────────────────────────────────────────────

export const saveDraftSchema = z.object({
  lessonId: uuid,
  bodyMd: bodyMdSchema,
  attachments: attachmentsSchema,
})
export const submitAssignmentSchema = saveDraftSchema

export const reviewSubmissionSchema = z.object({
  submissionId: uuid,
  status: z.enum(['reviewed', 'needs_redo']),
  comment: commentBodySchema.optional(),
})

// ── Notes (research.md R8) ───────────────────────────────────────────────────────────────────

/** `studentId` is omitted by students (taken from the session) and required for Admins. */
export const postNoteSchema = z.object({
  lessonId: uuid,
  studentId: uuid.optional(),
  body: commentBodySchema,
})

// ── Focus timer (research.md R3) ─────────────────────────────────────────────────────────────

export const startFocusSchema = z.object({
  lessonId: uuid,
  minutes: z.union([z.literal(FOCUS_MINUTES[0]), z.literal(FOCUS_MINUTES[1])]),
})
export const stopFocusSchema = z.object({ sessionId: uuid })

export type Attachment = z.infer<typeof attachmentSchema>
export type SaveDraftInput = z.infer<typeof saveDraftSchema>
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>
export type PostNoteInput = z.infer<typeof postNoteSchema>
export type StartFocusInput = z.infer<typeof startFocusSchema>
