// @vitest-environment node
// Spec 004 US1 scenarios 1–2, FR-002, FR-004 (research.md R1): what stops a lesson from being
// completed. Data-model.md Submission.status decides "a submission exists".
import { describe, expect, test } from 'vitest'
import { completionBlock } from './completion'

const open = {
  role: 'student' as const,
  locked: false,
  courseActive: true,
  requireSubmission: false,
  submissionStatus: null,
}

describe('completionBlock', () => {
  test('an open lesson of an Active course without "submit before complete" → allowed', () => {
    expect(completionBlock(open)).toBeNull()
  })

  test('a locked lesson → lesson_locked', () => {
    expect(completionBlock({ ...open, locked: true })).toBe('lesson_locked')
  })

  test('an Archived course → course_not_active', () => {
    expect(completionBlock({ ...open, courseActive: false })).toBe('course_not_active')
  })

  test.each([null, 'draft'] as const)(
    '"submit before complete" with submission %s → submission_required',
    (submissionStatus) => {
      expect(completionBlock({ ...open, requireSubmission: true, submissionStatus })).toBe(
        'submission_required',
      )
    },
  )

  test.each(['submitted', 'reviewed', 'needs_redo'] as const)(
    '"submit before complete" with a %s submission → allowed (a review never blocks completion)',
    (submissionStatus) => {
      expect(completionBlock({ ...open, requireSubmission: true, submissionStatus })).toBeNull()
    },
  )

  test('the Admin marks done without a submission (FR-002: the Admin decides)', () => {
    expect(
      completionBlock({ ...open, role: 'admin', requireSubmission: true, submissionStatus: null }),
    ).toBeNull()
  })

  test('the Admin still needs an Active course', () => {
    expect(completionBlock({ ...open, role: 'admin', courseActive: false })).toBe(
      'course_not_active',
    )
  })
})
