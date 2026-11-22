// @vitest-environment node
// Spec 002 contracts/server-actions.md › Field schemas; field rules from data-model.md.
import { MAX_CONTENT_BYTES } from '@/lib/content'
import { describe, expect, test } from 'vitest'
import {
  courseFieldsSchema,
  isStoragePathFor,
  lessonFieldsSchema,
  MAX_FILE_BYTES,
  resourceSchema,
} from './schemas'

const course = {
  title: 'JLPT N3 Grammar',
  description: '',
  icon: '文',
  color: 'indigo',
  targetDate: '2027-03-31',
  levelTag: 'N3',
  unlockInOrder: true,
  allowStudentNotes: true,
  status: 'draft',
}

const lesson = {
  title: 'Particles は vs が',
  estMinutes: 15,
  sectionId: null,
  unlockRule: { type: 'after_previous' },
  contentMd: '## は marks the topic',
  assignmentPrompt: '',
  requireSubmission: false,
}

const issueMessages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? []

describe('courseFieldsSchema', () => {
  test('a full course parses; empty optional text becomes null', () => {
    const parsed = courseFieldsSchema.parse(course)
    expect(parsed.description).toBeNull()
    expect(parsed.levelTag).toBe('N3')
  })
  test.each(['文', '漢', '📚', '🇯🇵'])('icon %s (one grapheme, ≤ 2 code points) passes', (icon) => {
    expect(courseFieldsSchema.safeParse({ ...course, icon }).success).toBe(true)
  })
  test.each(['', 'ab', '文字', '👩‍🏫'])('icon %j fails', (icon) => {
    expect(courseFieldsSchema.safeParse({ ...course, icon }).success).toBe(false)
  })
  test('unknown colour key fails', () => {
    expect(courseFieldsSchema.safeParse({ ...course, color: 'purple' }).success).toBe(false)
  })
  test.each(['31/03/2027', '2027-3-31', '2027-02-30'])('targetDate %s fails', (targetDate) => {
    expect(courseFieldsSchema.safeParse({ ...course, targetDate }).success).toBe(false)
  })
  test('targetDate may be null', () => {
    expect(courseFieldsSchema.parse({ ...course, targetDate: null }).targetDate).toBeNull()
  })
  test('title is trimmed and required; ≤ 120 characters', () => {
    expect(courseFieldsSchema.parse({ ...course, title: '  N3  ' }).title).toBe('N3')
    expect(courseFieldsSchema.safeParse({ ...course, title: '   ' }).success).toBe(false)
    expect(courseFieldsSchema.safeParse({ ...course, title: 'x'.repeat(121) }).success).toBe(false)
  })
  test('description ≤ 1000 and level tag ≤ 20 characters', () => {
    expect(courseFieldsSchema.safeParse({ ...course, description: 'x'.repeat(1001) }).success).toBe(
      false,
    )
    expect(courseFieldsSchema.safeParse({ ...course, levelTag: 'x'.repeat(21) }).success).toBe(
      false,
    )
  })
  test('the form only sets draft or active', () => {
    expect(courseFieldsSchema.safeParse({ ...course, status: 'active' }).success).toBe(true)
    expect(courseFieldsSchema.safeParse({ ...course, status: 'archived' }).success).toBe(false)
  })
})

describe('lessonFieldsSchema', () => {
  test('a lesson parses; an empty prompt becomes null', () => {
    expect(lessonFieldsSchema.parse(lesson).assignmentPrompt).toBeNull()
  })
  test('content up to the byte limit passes; one byte over fails with content_too_long', () => {
    // Burmese letters are 3 bytes each in UTF-8.
    const fits = 'က'.repeat(Math.floor(MAX_CONTENT_BYTES / 3))
    expect(lessonFieldsSchema.safeParse({ ...lesson, contentMd: fits }).success).toBe(true)
    expect(new TextEncoder().encode(fits + 'ab').length).toBe(MAX_CONTENT_BYTES)
    const over = fits + 'abc'
    const result = lessonFieldsSchema.safeParse({ ...lesson, contentMd: over })
    expect(result.success).toBe(false)
    expect(issueMessages(result)).toContain('content_too_long')
  })
  test.each([0, 601, 1.5])('estMinutes %s fails', (estMinutes) => {
    expect(lessonFieldsSchema.safeParse({ ...lesson, estMinutes }).success).toBe(false)
  })
  test.each([
    { type: 'none' },
    { type: 'after_previous' },
    { type: 'on_date', date: '2027-01-15' },
  ])('unlock rule %j passes', (unlockRule) => {
    expect(lessonFieldsSchema.safeParse({ ...lesson, unlockRule }).success).toBe(true)
  })
  test.each([{ type: 'on_date' }, { type: 'on_date', date: 'tomorrow' }, { type: 'weird' }])(
    'unlock rule %j fails',
    (unlockRule) => {
      expect(lessonFieldsSchema.safeParse({ ...lesson, unlockRule }).success).toBe(false)
    },
  )
  test('prompt ≤ 2000 characters; title 1–160', () => {
    expect(
      lessonFieldsSchema.safeParse({ ...lesson, assignmentPrompt: 'x'.repeat(2001) }).success,
    ).toBe(false)
    expect(lessonFieldsSchema.safeParse({ ...lesson, title: 'x'.repeat(161) }).success).toBe(false)
  })
})

describe('resourceSchema', () => {
  const courseId = '11111111-1111-4111-8111-111111111111'
  const lessonId = '22222222-2222-4222-8222-222222222222'
  const path = `${courseId}/${lessonId}/33333333-3333-4333-8333-333333333333.pdf`

  test('a link needs an https url', () => {
    expect(
      resourceSchema.safeParse({ kind: 'link', name: 'NHK', url: 'https://www3.nhk.or.jp' })
        .success,
    ).toBe(true)
    expect(
      resourceSchema.safeParse({ kind: 'link', name: 'NHK', url: 'http://www3.nhk.or.jp' }).success,
    ).toBe(false)
    expect(
      resourceSchema.safeParse({ kind: 'link', name: 'Bad', url: 'javascript:alert(1)' }).success,
    ).toBe(false)
  })
  test('a stored file needs a storage path and a size within the limit', () => {
    expect(
      resourceSchema.safeParse({
        kind: 'file',
        name: 'chart.pdf',
        storagePath: path,
        sizeBytes: 1000,
      }).success,
    ).toBe(true)
    expect(
      resourceSchema.safeParse({ kind: 'file', name: 'chart.pdf', sizeBytes: 1000 }).success,
    ).toBe(false)
    expect(
      resourceSchema.safeParse({
        kind: 'audio',
        name: 'a.mp3',
        storagePath: path,
        sizeBytes: MAX_FILE_BYTES + 1,
      }).success,
    ).toBe(false)
  })
  test('the storage path must sit under the given course and lesson', () => {
    expect(isStoragePathFor(path, courseId, lessonId)).toBe(true)
    expect(isStoragePathFor(path, lessonId, courseId)).toBe(false)
    expect(isStoragePathFor(`${courseId}/${lessonId}/../x.pdf`, courseId, lessonId)).toBe(false)
  })
})
