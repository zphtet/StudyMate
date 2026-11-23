// Spec 006 T036: the badge, title and summary of a rule row on Alerts and My reminders
// (contracts/ui-routes.md › Alerts). The screens turn these keys and values into text in the
// viewer's language; a student is always named, never "she/he" (FR-012).
import { describe, expect, test } from 'vitest'
import type { RuleConfig } from './rule-config'
import { ruleSummary } from './rule-summary'

const summary = (config: RuleConfig, name: string | null = 'May') => ruleSummary({ config }, name)

describe('the screenshot’s rules (24-AdminNotify.png)', () => {
  test('Daily study reminder · 20:00 · Mon–Fri', () => {
    expect(summary({ trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] })).toEqual({
      badge: 'DAY',
      title: { key: 'daily' },
      summary: { key: 'daily', time: '20:00', days: { kind: 'range', from: 1, to: 5 } },
    })
  })

  test('After shift ends · 2 h after each shift', () => {
    expect(summary({ trigger: 'after_shift', hours: 2 })).toEqual({
      badge: 'SHIFT',
      title: { key: 'after_shift' },
      summary: { key: 'after_shift', hours: 2 },
    })
  })

  test('Deadline coming up · 24 h and 2 h before, longest first', () => {
    expect(summary({ trigger: 'due_soon', offsets_h: [2, 24] })).toEqual({
      badge: 'DUE',
      title: { key: 'due_soon' },
      summary: { key: 'due_soon', hours: [24, 2] },
    })
  })

  test('Lesson overdue · At deadline, then daily 19:00 · max 3', () => {
    expect(summary({ trigger: 'overdue', repeat_time: '19:00', max: 3 })).toEqual({
      badge: 'LATE',
      title: { key: 'overdue' },
      summary: { key: 'overdue', time: '19:00', max: 3 },
    })
  })

  test('Streak at risk · 21:30 if nothing done today', () => {
    expect(summary({ trigger: 'streak_risk', time: '21:30' })).toEqual({
      badge: 'FIRE',
      title: { key: 'streak_risk' },
      summary: { key: 'streak_risk', time: '21:30' },
    })
  })

  test('No study for 2 days · Nudge May · alert me', () => {
    expect(summary({ trigger: 'inactive', days: 2, to: ['student', 'admin'] })).toEqual({
      badge: 'IDLE',
      title: { key: 'inactive', days: 2 },
      summary: { key: 'inactive', to: 'both', name: 'May' },
    })
  })

  test('Weekly summary · Sunday 18:00 · to both', () => {
    expect(
      summary({ trigger: 'weekly_summary', weekday: 7, time: '18:00', to: ['admin', 'student'] }),
    ).toEqual({
      badge: 'WEEK',
      title: { key: 'weekly_summary' },
      summary: { key: 'weekly_summary', weekday: 7, time: '18:00', to: 'both', name: 'May' },
    })
  })
})

describe('days of a daily rule', () => {
  const days = (list: number[]) => {
    const { summary: text } = summary({ trigger: 'daily', time: '20:00', days: list })
    return text.key === 'daily' ? text.days : null
  }

  test('all seven days read “Every day”', () => {
    expect(days([7, 1, 2, 3, 4, 5, 6])).toEqual({ kind: 'every' })
  })

  test('three or more days in a row read as a range, in any order', () => {
    expect(days([5, 3, 4])).toEqual({ kind: 'range', from: 3, to: 5 })
  })

  test('an irregular set, or fewer than three days, is a list in week order', () => {
    expect(days([5, 1, 3])).toEqual({ kind: 'list', days: [1, 3, 5] })
    expect(days([7, 6])).toEqual({ kind: 'list', days: [6, 7] })
    expect(days([2])).toEqual({ kind: 'list', days: [2] })
  })
})

describe('who gets an Inactive or Weekly alert, naming the student (FR-012)', () => {
  test('one recipient', () => {
    const nudge = summary({ trigger: 'inactive', days: 3, to: ['student'] }).summary
    expect(nudge).toEqual({ key: 'inactive', to: 'student', name: 'May' })
    const weekly = summary({ trigger: 'weekly_summary', weekday: 1, time: '08:00', to: ['admin'] })
    expect(weekly.summary).toMatchObject({ to: 'admin', name: 'May' })
  })

  test('a rule for All students has no single name', () => {
    expect(summary({ trigger: 'inactive', days: 3, to: ['student'] }, null).summary).toEqual({
      key: 'inactive',
      to: 'student',
      name: null,
    })
  })
})
