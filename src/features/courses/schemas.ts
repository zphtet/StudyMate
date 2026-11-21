import { z } from 'zod'

// Spec 002 contracts/server-actions.md › Field schemas. Shared by the forms (react-hook-form +
// zodResolver) and the Server Actions. Field rules: specs/002-courses-lessons/data-model.md.
// Error messages are keys under `validation.*`; `content_too_long` is also an action error code.

/** data-model.md Course.color */
export const COURSE_COLORS = ['indigo', 'teal', 'rust', 'berry', 'green', 'slate'] as const
export type CourseColor = (typeof COURSE_COLORS)[number]

/** data-model.md Lesson.contentMd (database CHECK octet_length <= 204800). */
export const MAX_CONTENT_BYTES = 204_800
/** data-model.md LessonResource.sizeBytes (and the lesson-files bucket limit). */
export const MAX_FILE_BYTES = 10_485_760

/** research.md R3 allow-list; must match the bucket's allowed_mime_types. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
] as const

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** data-model.md Course.icon: exactly one grapheme of at most 2 code points. */
export const isCourseIcon = (value: string) =>
  [...segmenter.segment(value)].length === 1 && [...value].length <= 2

/** A real calendar date written as YYYY-MM-DD. */
export const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** Optional text: trimmed, empty → null, at most `max` characters. */
const optionalText = (max: number, error: string) =>
  z
    .string()
    .trim()
    .max(max, { error })
    .nullish()
    .transform((v) => (v ? v : null))

const calendarDate = z.string().refine(isCalendarDate, { error: 'dateInvalid' })

// ── Courses ─────────────────────────────────────────────────────────────────────────────────

export const courseStatusSchema = z.enum(['draft', 'active', 'archived'])
export type CourseStatus = z.infer<typeof courseStatusSchema>

export const courseFieldsSchema = z.object({
  title: z.string().trim().min(1, { error: 'titleRequired' }).max(120, { error: 'titleTooLong' }),
  description: optionalText(1000, 'descriptionTooLong'),
  icon: z.string().refine(isCourseIcon, { error: 'iconInvalid' }),
  color: z.enum(COURSE_COLORS, { error: 'colorInvalid' }),
  targetDate: calendarDate.nullable(),
  levelTag: optionalText(20, 'levelTagTooLong'),
  unlockInOrder: z.boolean(),
  allowStudentNotes: z.boolean(),
  // The form sets draft or active; archiving has its own action (setCourseStatus).
  status: z.enum(['draft', 'active']),
})
export type CourseFieldsInput = z.input<typeof courseFieldsSchema>
export type CourseFields = z.output<typeof courseFieldsSchema>

// ── Sections ────────────────────────────────────────────────────────────────────────────────

/** data-model.md CourseSection.title */
export const sectionTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'sectionTitleRequired' })
  .max(80, { error: 'titleTooLong' })

// ── Lessons ─────────────────────────────────────────────────────────────────────────────────

/** data-model.md Lesson.unlockRule */
export const unlockRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('after_previous') }),
  z.object({ type: z.literal('on_date'), date: calendarDate }),
])
export type UnlockRule = z.infer<typeof unlockRuleSchema>

/** Reads a stored unlock_rule json value; anything unexpected counts as after_previous (the default). */
export function readUnlockRule(value: unknown): UnlockRule {
  const parsed = unlockRuleSchema.safeParse(value)
  return parsed.success ? parsed.data : { type: 'after_previous' }
}

export const lessonFieldsSchema = z.object({
  title: z.string().trim().min(1, { error: 'titleRequired' }).max(160, { error: 'titleTooLong' }),
  estMinutes: z
    .number({ error: 'minutesInvalid' })
    .int({ error: 'minutesInvalid' })
    .min(1, { error: 'minutesInvalid' })
    .max(600, { error: 'minutesInvalid' }),
  sectionId: z.uuid().nullable(),
  unlockRule: unlockRuleSchema,
  contentMd: z
    .string()
    .refine((v) => utf8Bytes(v) <= MAX_CONTENT_BYTES, { error: 'content_too_long' }),
  assignmentPrompt: optionalText(2000, 'promptTooLong'),
  requireSubmission: z.boolean(),
})
export type LessonFieldsInput = z.input<typeof lessonFieldsSchema>
export type LessonFields = z.output<typeof lessonFieldsSchema>

export const lessonStatusSchema = z.enum(['draft', 'published'])
export type LessonStatus = z.infer<typeof lessonStatusSchema>

// ── Resources ───────────────────────────────────────────────────────────────────────────────

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const STORAGE_PATH = new RegExp(`^(${UUID})/(${UUID})/${UUID}\\.[a-z0-9]{1,5}$`)

/** data-model.md LessonResource.storagePath: `<course_id>/<lesson_id>/<uuid>.<ext>`. */
export const isStoragePathFor = (path: string, courseId: string, lessonId: string) => {
  const match = STORAGE_PATH.exec(path)
  return !!match && match[1] === courseId && match[2] === lessonId
}

const resourceName = z.string().trim().min(1, { error: 'resourceNameRequired' }).max(200)

/** data-model.md LessonResource: links have an https url; every other kind a storage path. */
export const linkResourceSchema = z.object({
  kind: z.literal('link'),
  name: resourceName,
  url: z.url({ protocol: /^https$/, error: 'urlInvalid' }),
})

export const resourceSchema = z.discriminatedUnion('kind', [
  linkResourceSchema,
  z.object({
    kind: z.enum(['file', 'image', 'audio']),
    name: resourceName,
    storagePath: z.string().regex(STORAGE_PATH),
    sizeBytes: z.number().int().min(0).max(MAX_FILE_BYTES, { error: 'file_too_large' }),
  }),
])
export type ResourceInput = z.input<typeof resourceSchema>
export type ResourceFields = z.output<typeof resourceSchema>
