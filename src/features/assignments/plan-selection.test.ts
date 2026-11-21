// @vitest-environment node
// Spec 003 research R10: the Plan's URL state, read the same way by the page seed, the Route
// Handlers and the client.
import { describe, expect, test } from 'vitest'
import { isMonth, isWeek, planSelection } from './plan-selection'

const may = { id: 'may', displayName: 'May', timezone: 'Asia/Tokyo' }
const thant = { id: 'thant', displayName: 'Thant', timezone: 'Asia/Yangon' }
const pick = (query: string) => planSelection([may, thant], new URLSearchParams(query))

describe('isWeek / isMonth', () => {
  test('a week is a real Monday', () => {
    expect(isWeek('2026-11-23')).toBe(true)
    expect(isWeek('2026-11-24')).toBe(false) // Tuesday
    expect(isWeek('2026-02-30')).toBe(false) // no such date
    expect(isWeek('23-11-2026')).toBe(false)
    expect(isWeek(null)).toBe(false)
  })

  test('a month is YYYY-MM with a real month', () => {
    expect(isMonth('2026-11')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-1')).toBe(false)
    expect(isMonth(null)).toBe(false)
  })
})

describe('planSelection', () => {
  test('defaults: the first student, the week view, this week and month', () => {
    expect(pick('')).toEqual({ student: may, view: 'week', week: null, month: null })
  })

  test('a linked student, a Monday and the month view from the URL', () => {
    expect(pick('student=thant&view=month&week=2026-11-23&month=2027-01')).toEqual({
      student: thant,
      view: 'month',
      week: '2026-11-23',
      month: '2027-01',
    })
  })

  test('invalid values fall back: unknown student, non-Monday week; month follows the week', () => {
    expect(pick('student=nobody&week=2026-11-24')).toMatchObject({
      student: may,
      week: null,
      month: null,
    })
    expect(pick('week=2026-11-30&month=bad')).toMatchObject({
      week: '2026-11-30',
      month: '2026-11',
    })
  })
})
