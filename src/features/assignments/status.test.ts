// @vitest-environment node
// Spec 003 FR-004, FR-005, SC-002; research.md R1, R2: effective deadline and derived status, judged
// by the student's own calendar days.
import { describe, expect, test } from 'vitest'
import { zonedToUtc } from '@/lib/time'
import { courseDeadlineStatus, deadlineStatus, effectiveDue } from './status'

const HOUR = 3_600_000
const now = new Date('2026-11-20T12:00:00Z') // 21:00 Tokyo, 18:30 Yangon
const later = (hours: number) => new Date(now.getTime() + hours * HOUR)
const base = { done: false, locked: false, now, timeZone: 'Asia/Tokyo' }

describe('effectiveDue', () => {
  const lesson = new Date('2026-11-25T12:00:00Z')
  const course = new Date('2026-12-31T14:59:00Z')

  test('the lesson deadline wins over the course deadline', () => {
    expect(effectiveDue(lesson, course)).toBe(lesson)
  })
  test('the course deadline when the lesson has none', () => {
    expect(effectiveDue(null, course)).toBe(course)
  })
  test('none when neither is set', () => {
    expect(effectiveDue(null, null)).toBeNull()
    expect(effectiveDue(undefined, undefined)).toBeNull()
  })
})

describe('deadlineStatus', () => {
  test('done wins over everything, even a missed deadline', () => {
    expect(deadlineStatus({ ...base, dueAt: later(-48), done: true, locked: true })).toEqual({
      status: 'done',
      daysLate: 0,
    })
  })

  test('overdue wins over locked', () => {
    expect(deadlineStatus({ ...base, dueAt: later(-1), locked: true }).status).toBe('overdue')
  })

  test('due soon wins over locked', () => {
    expect(deadlineStatus({ ...base, dueAt: later(5), locked: true }).status).toBe('due_soon')
  })

  test('locked wins over upcoming', () => {
    expect(deadlineStatus({ ...base, dueAt: later(72), locked: true }).status).toBe('locked')
  })

  test('upcoming beyond 24 h', () => {
    expect(deadlineStatus({ ...base, dueAt: later(72) })).toEqual({
      status: 'upcoming',
      daysLate: 0,
    })
  })

  test('none without a deadline; locked or done still apply', () => {
    expect(deadlineStatus({ ...base, dueAt: null }).status).toBe('none')
    expect(deadlineStatus({ ...base, dueAt: null, locked: true }).status).toBe('locked')
    expect(deadlineStatus({ ...base, dueAt: null, done: true }).status).toBe('done')
  })

  test('the 24 h boundary: exactly 24 h is due soon, a minute more is upcoming', () => {
    expect(deadlineStatus({ ...base, dueAt: later(24) }).status).toBe('due_soon')
    expect(deadlineStatus({ ...base, dueAt: new Date(later(24).getTime() + 60_000) }).status).toBe(
      'upcoming',
    )
  })

  test('due right now is due soon; a moment later it is overdue', () => {
    expect(deadlineStatus({ ...base, dueAt: now }).status).toBe('due_soon')
    expect(deadlineStatus({ ...base, dueAt: new Date(now.getTime() - 1) }).status).toBe('overdue')
  })

  test('daysLate is 0 for a deadline earlier today ("Overdue")', () => {
    const dueAt = zonedToUtc('2026-11-20', '09:00', 'Asia/Tokyo')
    expect(deadlineStatus({ ...base, dueAt })).toEqual({ status: 'overdue', daysLate: 0 })
  })

  test('daysLate counts the student’s calendar days', () => {
    const dueAt = zonedToUtc('2026-11-18', '23:59', 'Asia/Tokyo')
    expect(deadlineStatus({ ...base, dueAt })).toEqual({ status: 'overdue', daysLate: 2 })
  })

  test('the same instants give different daysLate in Tokyo and Yangon', () => {
    const dueAt = new Date('2026-11-19T14:30:00Z') // 23:30 Tokyo 19 Nov, 21:00 Yangon 19 Nov
    const at = new Date('2026-11-20T16:00:00Z') // 01:00 Tokyo 21 Nov, 22:30 Yangon 20 Nov
    expect(deadlineStatus({ ...base, now: at, dueAt }).daysLate).toBe(2)
    expect(deadlineStatus({ ...base, now: at, dueAt, timeZone: 'Asia/Yangon' }).daysLate).toBe(1)
  })
})

describe('courseDeadlineStatus', () => {
  const course = { dueAt: later(-24), now, timeZone: 'Asia/Tokyo' }

  test('done only when every counting lesson is done', () => {
    expect(courseDeadlineStatus({ ...course, lessonCount: 3, doneCount: 3 }).status).toBe('done')
    expect(courseDeadlineStatus({ ...course, lessonCount: 3, doneCount: 2 })).toEqual({
      status: 'overdue',
      daysLate: 1,
    })
  })

  test('a course with no counting lessons is not done', () => {
    expect(courseDeadlineStatus({ ...course, lessonCount: 0, doneCount: 0 }).status).toBe('overdue')
  })

  test('due soon and upcoming follow the lesson rules', () => {
    expect(
      courseDeadlineStatus({ ...course, dueAt: later(3), lessonCount: 2, doneCount: 0 }).status,
    ).toBe('due_soon')
    expect(
      courseDeadlineStatus({ ...course, dueAt: later(30), lessonCount: 2, doneCount: 0 }).status,
    ).toBe('upcoming')
  })
})
