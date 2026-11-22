// @vitest-environment node
// Spec 002 US4 scenario 2 (T051), research.md R1, data-model.md Lesson.unlockRule: Open or Locked
// for each lesson a student can see.
import { describe, expect, test } from 'vitest'
import { todayIn } from '@/lib/time'
import { computeLocks, type LockLesson } from './lock'
import type { UnlockRule } from './schemas'

const afterPrevious: UnlockRule = { type: 'after_previous' }

function lesson(
  id: string,
  unlockRule: UnlockRule = afterPrevious,
  extra: Partial<LockLesson> = {},
): LockLesson {
  return { id, title: `Lesson ${id}`, status: 'published', deletedAt: null, unlockRule, ...extra }
}

const base = { done: new Set<string>(), today: '2026-11-21', archived: false }

describe('computeLocks', () => {
  test('`none` is always open', () => {
    const locks = computeLocks({ ...base, lessons: [lesson('a'), lesson('b', { type: 'none' })] })
    expect(locks.get('b')).toEqual({ state: 'open', lock: null })
  })

  test('with after_previous, the first visible lesson is open', () => {
    const locks = computeLocks({ ...base, lessons: [lesson('a'), lesson('b')] })
    expect(locks.get('a')).toEqual({ state: 'open', lock: null })
  })

  test('previous not done → locked with its number and title; done → open', () => {
    const lessons = [lesson('a'), lesson('b')]
    expect(computeLocks({ ...base, lessons }).get('b')).toEqual({
      state: 'locked',
      lock: { reason: 'after_previous', previous: { number: 1, title: 'Lesson a' } },
    })
    expect(computeLocks({ ...base, lessons, done: new Set(['a']) }).get('b')).toEqual({
      state: 'open',
      lock: null,
    })
  })

  test('a locked chain stays locked', () => {
    const locks = computeLocks({ ...base, lessons: [lesson('a'), lesson('b'), lesson('c')] })
    expect(locks.get('b')?.state).toBe('locked')
    expect(locks.get('c')).toEqual({
      state: 'locked',
      lock: { reason: 'after_previous', previous: { number: 2, title: 'Lesson b' } },
    })
  })

  test('Draft and deleted lessons are skipped when finding the previous lesson', () => {
    const lessons = [
      lesson('a'),
      lesson('draft', afterPrevious, { status: 'draft' }),
      lesson('gone', afterPrevious, { deletedAt: new Date() }),
      lesson('b'),
    ]
    const locks = computeLocks({ ...base, lessons, done: new Set(['a']) })
    expect(locks.get('b')).toEqual({ state: 'open', lock: null })
    // Students never see the Draft or deleted lesson.
    expect(locks.has('draft')).toBe(false)
    expect(locks.has('gone')).toBe(false)
    // Numbers count visible lessons only.
    const notDone = computeLocks({ ...base, lessons })
    expect(notDone.get('b')?.lock).toEqual({
      reason: 'after_previous',
      previous: { number: 1, title: 'Lesson a' },
    })
  })

  test('on_date: locked the day before, open on the day and after', () => {
    const lessons = [lesson('d', { type: 'on_date', date: '2026-11-21' })]
    expect(computeLocks({ ...base, lessons, today: '2026-11-20' }).get('d')).toEqual({
      state: 'locked',
      lock: { reason: 'on_date', date: '2026-11-21' },
    })
    expect(computeLocks({ ...base, lessons, today: '2026-11-21' }).get('d')?.state).toBe('open')
    expect(computeLocks({ ...base, lessons, today: '2026-12-01' }).get('d')?.state).toBe('open')
  })

  test("on_date opens at 00:00 in the student's own time zone", () => {
    const lessons = [lesson('d', { type: 'on_date', date: '2026-11-21' })]
    // 2026-11-20 18:00 UTC is 00:30 on 21 Nov in Yangon (UTC+6:30), still 20 Nov in UTC.
    const now = new Date('2026-11-20T18:00:00Z')
    const yangon = computeLocks({ ...base, lessons, today: todayIn('Asia/Yangon', now) })
    const utc = computeLocks({ ...base, lessons, today: todayIn('UTC', now) })
    expect(yangon.get('d')?.state).toBe('open')
    expect(utc.get('d')?.state).toBe('locked')
    // 17:29 UTC is 23:59 in Yangon: still locked there.
    const before = new Date('2026-11-20T17:29:00Z')
    expect(
      computeLocks({ ...base, lessons, today: todayIn('Asia/Yangon', before) }).get('d')?.state,
    ).toBe('locked')
  })

  test('every lesson of an Archived course is open', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('d', { type: 'on_date', date: '2099-01-01' })]
    const locks = computeLocks({ ...base, lessons, archived: true })
    expect([...locks.values()].every((l) => l.state === 'open')).toBe(true)
  })

  // Spec 004 research R1 (spec Edge Cases): undo doesn't cascade, so a lesson the student already
  // completed stays open even when an earlier lesson is no longer done.
  test('a done lesson is open even when the previous lesson is not done', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c'), lesson('d')]
    const locks = computeLocks({ ...base, lessons, done: new Set(['b', 'c']) })
    expect(locks.get('b')).toEqual({ state: 'open', lock: null })
    // c is done, and its previous lesson (b) is done too.
    expect(locks.get('c')).toEqual({ state: 'open', lock: null })
    // d follows a done lesson, so it opens as before.
    expect(locks.get('d')).toEqual({ state: 'open', lock: null })
  })

  test('a done lesson with a future on_date is open', () => {
    const locks = computeLocks({
      ...base,
      lessons: [lesson('a', { type: 'on_date', date: '2026-12-01' })],
      done: new Set(['a']),
    })
    expect(locks.get('a')).toEqual({ state: 'open', lock: null })
  })

  test('a lesson that is not done after a not-done lesson stays locked', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c')]
    const locks = computeLocks({ ...base, lessons, done: new Set(['c']) })
    expect(locks.get('b')?.state).toBe('locked')
    expect(locks.get('c')?.state).toBe('open')
  })
})
