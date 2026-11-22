// Spec 002 US2 (T038), research.md R3: client-side checks before a lesson file is uploaded.
import { describe, expect, test } from 'vitest'
import { isStoragePathFor, MAX_FILE_BYTES } from './schemas'
import { checkFile, extensionFor, storagePathFor } from './upload'

const COURSE = 'c0000000-0000-4000-8000-000000000001'
const LESSON = 'c0000000-0000-4000-8000-000000000002'

describe('checkFile', () => {
  test('accepts the allow-list up to 10 MB (data-model.md LessonResource.sizeBytes)', () => {
    expect(checkFile({ size: MAX_FILE_BYTES, type: 'application/pdf' })).toBeNull()
    expect(checkFile({ size: 1, type: 'image/png' })).toBeNull()
    expect(checkFile({ size: 1, type: 'audio/mpeg' })).toBeNull()
    expect(checkFile({ size: 1, type: 'audio/x-m4a' })).toBeNull()
  })

  test('rejects files over the limit', () => {
    expect(checkFile({ size: MAX_FILE_BYTES + 1, type: 'application/pdf' })).toBe('file_too_large')
    expect(checkFile({ size: 12 * 1024 * 1024, type: 'image/jpeg' })).toBe('file_too_large')
  })

  test('rejects types outside the research.md R3 allow-list', () => {
    for (const type of ['', 'text/html', 'image/svg+xml', 'application/zip', 'video/mp4']) {
      expect(checkFile({ size: 10, type })).toBe('file_type_not_allowed')
    }
  })

  test('large images may exceed 10 MB before resizing', () => {
    // A 12 MB photo is fine when it will be resized and re-encoded first.
    expect(checkFile({ size: 12 * 1024 * 1024, type: 'image/jpeg' }, { resizes: true })).toBeNull()
    expect(checkFile({ size: 12 * 1024 * 1024, type: 'image/gif' }, { resizes: true })).toBe(
      'file_too_large',
    )
  })
})

describe('storage path', () => {
  test('is <courseId>/<lessonId>/<uuid>.<ext> (data-model.md LessonResource.storagePath)', () => {
    const path = storagePathFor(COURSE, LESSON, 'pdf')
    expect(path).toMatch(new RegExp(`^${COURSE}/${LESSON}/[0-9a-f-]{36}\\.pdf$`))
    expect(isStoragePathFor(path, COURSE, LESSON)).toBe(true)
    expect(storagePathFor(COURSE, LESSON, 'pdf')).not.toBe(path)
  })

  test('the extension comes from the name, else from the type', () => {
    expect(extensionFor('Chart.PDF', 'application/pdf')).toBe('pdf')
    expect(extensionFor('lesson 3.m4a', 'audio/x-m4a')).toBe('m4a')
    expect(extensionFor('recording', 'audio/mpeg')).toBe('mp3')
    expect(extensionFor('photo.jpeg?x', 'image/jpeg')).toBe('jpg')
    expect(extensionFor('noext', 'image/webp')).toBe('webp')
  })
})
