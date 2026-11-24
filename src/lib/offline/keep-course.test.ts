import { describe, expect, it } from 'vitest'
import type { OfflineCourse } from './db'
import { changedSince, COURSE_BUDGET_BYTES, pickEviction, pickMedia } from './keep-course'

// Spec 008 US2 scenario 1, Edge Cases (storage quota); research R3; data-model.md
// offlineCourses.bytes, offlineCourses.openedAt.

const MB = 1024 * 1024
const ME = 'me'

const course = (courseId: string, openedAt: number): OfflineCourse => ({
  userId: ME,
  courseId,
  openedAt,
  lessonIds: [`${courseId}-l1`],
  mediaUrls: [`/api/lesson-files/${courseId}/a.png`],
  bytes: MB,
})

describe('pickMedia', () => {
  it('keeps lesson order within the 20 MB budget, skipping files that would cross it', () => {
    const items = [
      { url: 'a', sizeBytes: 8 * MB },
      { url: 'b', sizeBytes: 10 * MB },
      { url: 'c', sizeBytes: 5 * MB }, // would make 23 MB
      { url: 'd', sizeBytes: 2 * MB }, // still fits: 20 MB
    ]
    expect(COURSE_BUDGET_BYTES).toBe(20 * MB)
    expect(pickMedia(items)).toEqual(['a', 'b', 'd'])
  })

  it('counts what the course already keeps', () => {
    expect(pickMedia([{ url: 'a', sizeBytes: 3 * MB }], 2 * MB)).toEqual([])
  })

  it('a file of unknown size is kept when there is room', () => {
    expect(pickMedia([{ url: 'a', sizeBytes: null }])).toEqual(['a'])
  })
})

describe('pickEviction', () => {
  const courses = [course('old', 1), course('current', 2), course('recent', 3)]

  it('frees the least recently opened course other than the current one above 80 % of quota', () => {
    expect(pickEviction(courses, 'current', { usage: 81, quota: 100 })?.courseId).toBe('old')
    expect(pickEviction(courses, 'old', { usage: 90, quota: 100 })?.courseId).toBe('current')
  })

  it('frees nothing below 80 %, or when only the current course is kept', () => {
    expect(pickEviction(courses, 'current', { usage: 80, quota: 100 })).toBeNull()
    expect(pickEviction([course('current', 1)], 'current', { usage: 99, quota: 100 })).toBeNull()
  })
})

describe('changedSince', () => {
  it('lists only the lesson pages and files not stored yet', () => {
    const kept = course('c', 1)
    expect(
      changedSince(
        kept,
        ['c-l1', 'c-l2'],
        ['/api/lesson-files/c/a.png', '/api/lesson-files/c/b.png'],
      ),
    ).toEqual({ lessonIds: ['c-l2'], mediaUrls: ['/api/lesson-files/c/b.png'] })
    expect(changedSince(undefined, ['x'], ['y'])).toEqual({ lessonIds: ['x'], mediaUrls: ['y'] })
  })
})
