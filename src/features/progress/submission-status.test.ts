// @vitest-environment node
// Spec 004 FR-004, research.md R7 (data-model.md Submission.status): who may move a submission from
// which status to which. Every row of the table, and every move it doesn't allow.
import { describe, expect, test } from 'vitest'
import type { SubmissionStatus } from '@/generated/prisma/client'
import { adminCanReview, canStudentEdit, studentNext } from './submission-status'

const ALL: SubmissionStatus[] = ['draft', 'submitted', 'reviewed', 'needs_redo']

describe('canStudentEdit', () => {
  test.each([null, 'draft', 'needs_redo'] as const)('%s → editable', (status) => {
    expect(canStudentEdit(status)).toBe(true)
  })

  test.each(['submitted', 'reviewed'] as const)('%s → read-only', (status) => {
    expect(canStudentEdit(status)).toBe(false)
  })
})

describe('studentNext', () => {
  test('save: a new submission starts as a draft', () => {
    expect(studentNext(null, 'save')).toBe('draft')
  })

  test.each(['draft', 'needs_redo'] as const)('save keeps %s', (status) => {
    expect(studentNext(status, 'save')).toBe(status)
  })

  test.each([null, 'draft', 'needs_redo'] as const)('submit from %s → submitted', (status) => {
    expect(studentNext(status, 'submit')).toBe('submitted')
  })

  test.each(['submitted', 'reviewed'] as const)('%s refuses save and submit', (status) => {
    expect(studentNext(status, 'save')).toBeNull()
    expect(studentNext(status, 'submit')).toBeNull()
  })
})

describe('adminCanReview', () => {
  const allowedFrom: SubmissionStatus[] = ['submitted', 'reviewed', 'needs_redo']
  const targets = ['reviewed', 'needs_redo'] as const

  test.each(allowedFrom.flatMap((from) => targets.map((to) => [from, to] as const)))(
    '%s → %s is allowed (the Admin may change a review until the student resubmits)',
    (from, to) => {
      expect(adminCanReview(from, to)).toBe(true)
    },
  )

  test.each(targets)('a draft is never reviewed (→ %s)', (to) => {
    expect(adminCanReview('draft', to)).toBe(false)
  })

  test.each(ALL)('the Admin never moves %s to draft or submitted', (from) => {
    expect(adminCanReview(from, 'draft')).toBe(false)
    expect(adminCanReview(from, 'submitted')).toBe(false)
  })
})
