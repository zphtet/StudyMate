// @vitest-environment node
// Spec 002 data-model.md › Ordering; research.md R7.
import { describe, expect, test } from 'vitest'
import { groupCourse, numberLessons, renumber } from './order'

const t = (n: number) => new Date(Date.UTC(2026, 10, 21, 0, 0, n))
const sections = [
  { id: 'w4', position: 1 },
  { id: 'w3', position: 0 },
]
const lessons = [
  { id: 'c', sectionId: 'w4', position: 0, updatedAt: t(1) },
  { id: 'a', sectionId: 'w3', position: 1, updatedAt: t(1) },
  { id: 'x', sectionId: null, position: 0, updatedAt: t(1) },
  { id: 'b', sectionId: 'w3', position: 0, updatedAt: t(1) },
]

describe('groupCourse', () => {
  test('no-section group first, then sections by position, lessons by position', () => {
    const groups = groupCourse(sections, lessons)
    expect(groups.map((g) => [g.section?.id ?? null, g.lessons.map((l) => l.id)])).toEqual([
      [null, ['x']],
      ['w3', ['b', 'a']],
      ['w4', ['c']],
    ])
  })
  test('the no-section group is left out when empty and the course has sections', () => {
    const groups = groupCourse(
      sections,
      lessons.filter((l) => l.sectionId),
    )
    expect(groups.map((g) => g.section?.id ?? null)).toEqual(['w3', 'w4'])
  })
  test('a course with no sections always has the no-section group (so "+ Add lesson" has a place)', () => {
    expect(groupCourse([], [])).toEqual([{ section: null, lessons: [] }])
  })
  test('empty sections are kept', () => {
    const groups = groupCourse([...sections, { id: 'w5', position: 2 }], lessons)
    expect(groups.at(-1)).toEqual({ section: { id: 'w5', position: 2 }, lessons: [] })
  })
})

describe('numberLessons', () => {
  test('numbers lessons 1..n in course order', () => {
    const numbers = numberLessons(groupCourse(sections, lessons))
    expect([...numbers.entries()]).toEqual([
      ['x', 1],
      ['b', 2],
      ['a', 3],
      ['c', 4],
    ])
  })
  test('numbers only the lessons it is given (students: visible lessons)', () => {
    const visible = lessons.filter((l) => l.id !== 'b')
    expect(numberLessons(groupCourse(sections, visible)).get('a')).toBe(2)
  })
})

describe('renumber', () => {
  test('gives 0..n−1 without gaps, keeping order', () => {
    const result = renumber([
      { id: 'p', position: 4, updatedAt: t(1) },
      { id: 'q', position: 9, updatedAt: t(1) },
      { id: 'r', position: 0, updatedAt: t(1) },
    ])
    expect(result).toEqual([
      { id: 'r', position: 0 },
      { id: 'p', position: 1 },
      { id: 'q', position: 2 },
    ])
  })
  test('ties are broken by updatedAt (older first)', () => {
    const result = renumber([
      { id: 'restored', position: 1, updatedAt: t(5) },
      { id: 'stayed', position: 1, updatedAt: t(2) },
      { id: 'first', position: 0, updatedAt: t(9) },
    ])
    expect(result.map((r) => r.id)).toEqual(['first', 'stayed', 'restored'])
  })
})
