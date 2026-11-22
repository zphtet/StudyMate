// Spec 004 contracts/server-actions.md › Field schemas; data-model.md Submission.body_md,
// Submission.attachments, Comment.body, StudySession.planned_minutes. Forms and actions share these.
import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { MAX_CONTENT_BYTES } from '@/features/courses/schemas'
import {
  attachmentsSchema,
  bodyMdSchema,
  commentBodySchema,
  completeLessonSchema,
  isOwnSubmissionPath,
  postNoteSchema,
  reviewSubmissionSchema,
  saveDraftSchema,
  setLessonDoneSchema,
  startFocusSchema,
  stopFocusSchema,
} from './schemas'

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message

const image = (size = 300_000) => ({ path: `a/b/${randomUUID()}.webp`, name: 'photo.jpg', size })

describe('attachmentsSchema', () => {
  test('0 to 5 images are accepted', () => {
    expect(attachmentsSchema.safeParse([]).success).toBe(true)
    expect(attachmentsSchema.safeParse(Array.from({ length: 5 }, () => image())).success).toBe(true)
  })
  test('6 images → too_many_images', () => {
    const result = attachmentsSchema.safeParse(Array.from({ length: 6 }, () => image()))
    expect(firstMessage(result)).toBe('too_many_images')
  })
  test('an image over 2 MB → file_too_large', () => {
    expect(attachmentsSchema.safeParse([image(2_097_152)]).success).toBe(true)
    expect(firstMessage(attachmentsSchema.safeParse([image(2_097_153)]))).toBe('file_too_large')
  })
  test('an empty name or a zero size is refused', () => {
    expect(attachmentsSchema.safeParse([{ ...image(), name: ' ' }]).success).toBe(false)
    expect(attachmentsSchema.safeParse([image(0)]).success).toBe(false)
  })
})

describe('bodyMdSchema', () => {
  test('an empty body is fine for a draft', () => {
    expect(bodyMdSchema.safeParse('').success).toBe(true)
  })
  test('counts UTF-8 bytes: Japanese text over the limit → content_too_long', () => {
    const atLimit = 'あ'.repeat(Math.floor(MAX_CONTENT_BYTES / 3))
    expect(bodyMdSchema.safeParse(atLimit).success).toBe(true)
    expect(firstMessage(bodyMdSchema.safeParse(`${atLimit}ああ`))).toBe('content_too_long')
  })
})

describe('commentBodySchema', () => {
  test('trims and accepts 1–2000 characters', () => {
    expect(commentBodySchema.parse('  hi  ')).toBe('hi')
    expect(commentBodySchema.safeParse('x'.repeat(2000)).success).toBe(true)
  })
  test('blank → commentRequired, 2001 characters → commentTooLong', () => {
    expect(firstMessage(commentBodySchema.safeParse('   '))).toBe('commentRequired')
    expect(firstMessage(commentBodySchema.safeParse('x'.repeat(2001)))).toBe('commentTooLong')
  })
})

describe('action inputs', () => {
  const lessonId = randomUUID()
  const studentId = randomUUID()

  test('ids must be uuids', () => {
    expect(completeLessonSchema.safeParse({ lessonId }).success).toBe(true)
    expect(completeLessonSchema.safeParse({ lessonId: 'lesson-1' }).success).toBe(false)
    expect(stopFocusSchema.safeParse({ sessionId: '123' }).success).toBe(false)
  })
  test('setLessonDone needs the student, the lesson and a boolean', () => {
    expect(setLessonDoneSchema.safeParse({ studentId, lessonId, done: true }).success).toBe(true)
    expect(setLessonDoneSchema.safeParse({ studentId, lessonId, done: 'yes' }).success).toBe(false)
    expect(setLessonDoneSchema.safeParse({ lessonId, done: true }).success).toBe(false)
  })
  test('saveDraft takes a body and the attachments', () => {
    expect(
      saveDraftSchema.safeParse({ lessonId, bodyMd: '# Hi', attachments: [image()] }).success,
    ).toBe(true)
  })
  test('a review is Reviewed or Needs redo, with an optional comment', () => {
    const submissionId = randomUUID()
    expect(reviewSubmissionSchema.safeParse({ submissionId, status: 'reviewed' }).success).toBe(
      true,
    )
    expect(
      reviewSubmissionSchema.safeParse({
        submissionId,
        status: 'needs_redo',
        comment: 'Check です',
      }).success,
    ).toBe(true)
    for (const status of ['draft', 'submitted', 'done']) {
      expect(reviewSubmissionSchema.safeParse({ submissionId, status }).success).toBe(false)
    }
  })
  test('postNote: studentId is optional (students), the body follows commentBodySchema', () => {
    expect(postNoteSchema.safeParse({ lessonId, body: 'Question' }).success).toBe(true)
    expect(postNoteSchema.safeParse({ lessonId, studentId, body: 'Answer' }).success).toBe(true)
    expect(firstMessage(postNoteSchema.safeParse({ lessonId, body: '' }))).toBe('commentRequired')
  })
  test('focus lengths are 15 or 25 minutes only', () => {
    expect(startFocusSchema.safeParse({ lessonId, minutes: 15 }).success).toBe(true)
    expect(startFocusSchema.safeParse({ lessonId, minutes: 25 }).success).toBe(true)
    for (const minutes of [0, 20, 60, '15']) {
      expect(startFocusSchema.safeParse({ lessonId, minutes }).success).toBe(false)
    }
  })
})

describe('isOwnSubmissionPath', () => {
  const studentId = randomUUID()
  const lessonId = randomUUID()
  const own = `${studentId}/${lessonId}/${randomUUID()}.webp`

  test('a file directly in <student>/<lesson>/ is the student’s', () => {
    expect(isOwnSubmissionPath(own, studentId, lessonId)).toBe(true)
    expect(
      isOwnSubmissionPath(`${studentId}/${lessonId}/${randomUUID()}.jpg`, studentId, lessonId),
    ).toBe(true)
  })
  test.each([
    ['another student’s folder', `${randomUUID()}/${lessonId}/${randomUUID()}.webp`],
    ['another lesson', `${studentId}/${randomUUID()}/${randomUUID()}.webp`],
    ['a nested folder', `${studentId}/${lessonId}/x/${randomUUID()}.webp`],
    ['a parent-folder escape', `${studentId}/${lessonId}/../${randomUUID()}.webp`],
    ['a file type that isn’t an image', `${studentId}/${lessonId}/${randomUUID()}.pdf`],
  ])('%s → false', (_, path) => {
    expect(isOwnSubmissionPath(path, studentId, lessonId)).toBe(false)
  })
})
