// @vitest-environment node
// Spec 004 US3 scenario 2, research.md R6: the finish forecast from the last 14 days' pace and the
// student's own course deadline (course_assignments.due_at, as a local date).
import { describe, expect, test } from 'vitest'
import { forecast } from './forecast'

const today = '2026-11-22'
const base = { published: 20, done: 8, doneLast14: 7, today, dueOn: null }

describe('forecast', () => {
  test('no published lessons → empty ("—")', () => {
    expect(forecast({ ...base, published: 0, done: 0 })).toEqual({ kind: 'empty' })
  })

  test('every lesson done → finished', () => {
    expect(forecast({ ...base, done: 20 })).toEqual({ kind: 'finished' })
  })

  test('no completions in the last 14 days → no_pace with the lessons left', () => {
    expect(forecast({ ...base, doneLast14: 0, dueOn: '2026-12-31' })).toEqual({
      kind: 'no_pace',
      remaining: 12,
    })
  })

  test('no deadline → no_deadline with the lessons left and the finish date', () => {
    // 12 left at 0.5 a day → 24 days.
    expect(forecast(base)).toEqual({ kind: 'no_deadline', remaining: 12, finishOn: '2026-12-16' })
  })

  test('finishing on the due date itself is on track', () => {
    expect(forecast({ ...base, dueOn: '2026-12-16' })).toEqual({
      kind: 'on_track',
      finishOn: '2026-12-16',
      dueOn: '2026-12-16',
    })
  })

  test('one day after the due date is behind', () => {
    expect(forecast({ ...base, dueOn: '2026-12-15' })).toEqual({
      kind: 'behind',
      finishOn: '2026-12-16',
      dueOn: '2026-12-15',
    })
  })

  test('a fractional number of days rounds up', () => {
    // 1 left at 3/14 a day → 4.67 days → 5.
    expect(forecast({ ...base, done: 19, doneLast14: 3 })).toMatchObject({ finishOn: '2026-11-27' })
  })
})
