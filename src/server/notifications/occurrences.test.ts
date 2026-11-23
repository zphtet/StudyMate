// @vitest-environment node
// Spec 006 T035: rule occurrences (research R3 table; data-model.md NotificationRule.trigger,
// NotificationRule.config, Notification.occurrence_key, Notification.expires_at). Each case runs in
// Tokyo, Yangon (+06:30) and New York, whose 2027 daylight-saving changes are Sun 14 Mar (spring
// forward at 02:00) and Sun 7 Nov (fall back at 02:00). Mon 1 Mar 2027 is a Monday.
import { describe, expect, test } from 'vitest'
import type { RuleConfig } from '@/lib/notifications/rule-config'
import type { DayActivity } from '@/lib/streak'
import { addCalendarDays, zonedToUtc } from '@/lib/time'
import {
  adminWeeklySummary,
  occurrences,
  stillApplies,
  type AssignedLesson,
  type Occurrence,
  type StudentData,
  type Window,
} from './occurrences'

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'
const NEW_YORK = 'America/New_York'
const ZONES = [TOKYO, YANGON, NEW_YORK]
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const at = (date: string, time: string, zone: string) => zonedToUtc(date, time, zone)
const noData: StudentData = { lessons: [], activity: [], shifts: [] }

/** Every occurrence from `from` to `to`, swept in back-to-back 15-minute windows like the dispatcher. */
function sweep(
  rule: RuleConfig,
  zone: string,
  data: StudentData,
  { from, to }: { from: Date; to: Date },
): Occurrence[] {
  const found: Occurrence[] = []
  for (let t = from.getTime(); t < to.getTime(); t += 15 * MINUTE) {
    const window: Window = { from: new Date(t), to: new Date(t + 15 * MINUTE) }
    found.push(...occurrences(rule, { id: 'may', timezone: zone }, data, window))
  }
  return found
}

/** Whole local days, from 00:00 of the first to 00:00 after the last. */
const days = (first: string, last: string, zone: string) => ({
  from: at(first, '00:00', zone),
  to: at(addCalendarDays(last, 1), '00:00', zone),
})

const lesson = (overrides: Partial<AssignedLesson> = {}): AssignedLesson => ({
  lessonId: 'lesson-1',
  lesson: 'Particles は vs が',
  course: 'JLPT N4',
  dueAt: at('2027-03-05', '23:59', TOKYO),
  completed: false,
  ...overrides,
})

const studied = (date: string, seconds = 1200): DayActivity => ({ date, seconds, completions: 0 })

describe.each(ZONES)('daily in %s', (zone) => {
  const rule: RuleConfig = { trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] }

  test('20:00 local on the chosen weekdays only, keyed by date, lapsing at local midnight', () => {
    // Mon 1 – Sun 7 Mar 2027.
    const found = sweep(rule, zone, noData, days('2027-03-01', '2027-03-07', zone))
    expect(found.map((o) => o.key)).toEqual([
      '2027-03-01',
      '2027-03-02',
      '2027-03-03',
      '2027-03-04',
      '2027-03-05',
    ])
    expect(found[0]).toMatchObject({
      to: 'student',
      at: at('2027-03-01', '20:00', zone),
      expiresAt: at('2027-03-02', '00:00', zone),
    })
  })

  test('the instant is exact inside the window and nothing outside it', () => {
    const window = { from: at('2027-03-03', '19:50', zone), to: at('2027-03-03', '20:00', zone) }
    expect(occurrences(rule, { id: 'may', timezone: zone }, noData, window)).toHaveLength(1)
    const before = { from: at('2027-03-03', '19:40', zone), to: at('2027-03-03', '19:59', zone) }
    expect(occurrences(rule, { id: 'may', timezone: zone }, noData, before)).toHaveLength(0)
  })
})

describe('daily across daylight saving (New York)', () => {
  test('a time that does not exist on spring-forward day moves to the next valid minute', () => {
    const rule: RuleConfig = { trigger: 'daily', time: '02:30', days: [1, 2, 3, 4, 5, 6, 7] }
    const found = sweep(rule, NEW_YORK, noData, days('2027-03-14', '2027-03-14', NEW_YORK))
    expect(found).toHaveLength(1)
    // 02:00–02:59 doesn't exist; the clock reads 03:00 at 07:00 UTC.
    expect(found[0].at).toEqual(new Date('2027-03-14T07:00:00Z'))
    expect(found[0].key).toBe('2027-03-14')
  })

  test('20:00 stays 20:00 local on both sides of spring forward', () => {
    const rule: RuleConfig = { trigger: 'daily', time: '20:00', days: [6, 7, 1] }
    const found = sweep(rule, NEW_YORK, noData, days('2027-03-13', '2027-03-15', NEW_YORK))
    expect(found.map((o) => o.at.toISOString())).toEqual([
      '2027-03-14T01:00:00.000Z', // Sat 20:00 EST
      '2027-03-15T00:00:00.000Z', // Sun 20:00 EDT
      '2027-03-16T00:00:00.000Z', // Mon 20:00 EDT
    ])
  })

  test('a time that happens twice on fall-back day occurs once', () => {
    const rule: RuleConfig = { trigger: 'daily', time: '01:30', days: [7] }
    const found = sweep(rule, NEW_YORK, noData, days('2027-11-07', '2027-11-07', NEW_YORK))
    expect(found.map((o) => o.key)).toEqual(['2027-11-07'])
  })
})

describe.each(ZONES)('after_shift in %s', (zone) => {
  const rule: RuleConfig = { trigger: 'after_shift', hours: 2 }
  const endAt = at('2027-03-03', '18:00', zone)

  test('shift end + hours, keyed by the shift, lapsing at the next shift’s start', () => {
    const nextStartAt = at('2027-03-04', '09:00', zone)
    const data = { ...noData, shifts: [{ id: 'shift-1', endAt, nextStartAt }] }
    const found = sweep(rule, zone, data, days('2027-03-03', '2027-03-04', zone))
    expect(found).toEqual([
      expect.objectContaining({
        to: 'student',
        at: at('2027-03-03', '20:00', zone),
        key: 'shift-1',
        expiresAt: nextStartAt,
      }),
    ])
  })

  test('half hours, and never lapsing without a next shift', () => {
    const data = { ...noData, shifts: [{ id: 'shift-1', endAt, nextStartAt: null }] }
    const half: RuleConfig = { trigger: 'after_shift', hours: 0.5 }
    const [found] = sweep(half, zone, data, days('2027-03-03', '2027-03-03', zone))
    expect(found).toMatchObject({ at: at('2027-03-03', '18:30', zone), expiresAt: null })
  })
})

describe.each(ZONES)('due_soon in %s', (zone) => {
  const rule: RuleConfig = { trigger: 'due_soon', offsets_h: [24, 2] }
  const dueAt = at('2027-03-05', '23:59', zone)

  test('each offset before the effective deadline, keyed by lesson, deadline and hours', () => {
    const data = { ...noData, lessons: [lesson({ dueAt })] }
    const found = sweep(rule, zone, data, days('2027-03-03', '2027-03-06', zone))
    const due = dueAt.toISOString()
    expect(found.map((o) => [o.key, o.at, o.expiresAt])).toEqual([
      [`lesson-1@${due}#24`, new Date(dueAt.getTime() - 24 * HOUR), dueAt],
      [`lesson-1@${due}#2`, new Date(dueAt.getTime() - 2 * HOUR), dueAt],
    ])
    expect(found[0].values).toMatchObject({
      lessonId: 'lesson-1',
      lesson: 'Particles は vs が',
      course: 'JLPT N4',
      dueAt,
    })
  })

  test('none for a completed lesson or one without a deadline', () => {
    const data = {
      ...noData,
      lessons: [lesson({ dueAt, completed: true }), lesson({ lessonId: 'lesson-2', dueAt: null })],
    }
    expect(sweep(rule, zone, data, days('2027-03-03', '2027-03-06', zone))).toHaveLength(0)
  })
})

describe.each(ZONES)('overdue in %s', (zone) => {
  const dueAt = at('2027-03-03', '23:59', zone)
  const data = { ...noData, lessons: [lesson({ dueAt })] }
  const due = dueAt.toISOString()

  test('max 3: at the deadline, then daily at the repeat time, each lapsing at the next', () => {
    const rule: RuleConfig = { trigger: 'overdue', repeat_time: '19:00', max: 3 }
    const found = sweep(rule, zone, data, days('2027-03-03', '2027-03-09', zone))
    expect(found.map((o) => [o.key, o.at, o.expiresAt])).toEqual([
      [`lesson-1@${due}#0`, dueAt, at('2027-03-04', '19:00', zone)],
      [`lesson-1@${due}#1`, at('2027-03-04', '19:00', zone), at('2027-03-05', '19:00', zone)],
      // The last one lapses at the end of its day.
      [`lesson-1@${due}#2`, at('2027-03-05', '19:00', zone), at('2027-03-06', '00:00', zone)],
    ])
  })

  test('max 1: only the one at the deadline, lapsing at the end of that day', () => {
    const rule: RuleConfig = { trigger: 'overdue', repeat_time: '19:00', max: 1 }
    const found = sweep(rule, zone, data, days('2027-03-03', '2027-03-09', zone))
    expect(found.map((o) => [o.key, o.expiresAt])).toEqual([
      [`lesson-1@${due}#0`, at('2027-03-04', '00:00', zone)],
    ])
  })

  test('the first repeat is the first repeat time after the deadline', () => {
    const noon = at('2027-03-03', '12:00', zone)
    const rule: RuleConfig = { trigger: 'overdue', repeat_time: '19:00', max: 2 }
    const found = sweep(
      rule,
      zone,
      { ...noData, lessons: [lesson({ dueAt: noon })] },
      days('2027-03-03', '2027-03-05', zone),
    )
    expect(found.map((o) => o.at)).toEqual([noon, at('2027-03-03', '19:00', zone)])
  })

  test('none once the lesson is completed', () => {
    const rule: RuleConfig = { trigger: 'overdue', repeat_time: '19:00', max: 3 }
    const done = { ...noData, lessons: [lesson({ dueAt, completed: true })] }
    expect(sweep(rule, zone, done, days('2027-03-03', '2027-03-09', zone))).toHaveLength(0)
  })
})

describe.each(ZONES)('streak_risk in %s', (zone) => {
  const rule: RuleConfig = { trigger: 'streak_risk', time: '21:30' }

  test('at the time on a day with no activity, lapsing at local midnight', () => {
    const found = sweep(rule, zone, noData, days('2027-03-03', '2027-03-03', zone))
    expect(found).toEqual([
      expect.objectContaining({
        at: at('2027-03-03', '21:30', zone),
        key: '2027-03-03',
        expiresAt: at('2027-03-04', '00:00', zone),
      }),
    ])
  })

  test('not on a day the student already studied (004 FR-006: 10 minutes or a completion)', () => {
    const active = { ...noData, activity: [studied('2027-03-03')] }
    expect(sweep(rule, zone, active, days('2027-03-03', '2027-03-03', zone))).toHaveLength(0)
    const tooShort = { ...noData, activity: [studied('2027-03-03', 300)] }
    expect(sweep(rule, zone, tooShort, days('2027-03-03', '2027-03-03', zone))).toHaveLength(1)
  })
})

describe.each(ZONES)('inactive in %s', (zone) => {
  const data = { ...noData, activity: [studied('2027-03-01')] }

  test('after `days` full local days without study, once per gap, keyed by the last active date', () => {
    const rule: RuleConfig = { trigger: 'inactive', days: 2, to: ['student'] }
    const found = sweep(rule, zone, data, days('2027-03-01', '2027-03-10', zone))
    // Tue 2 and Wed 3 are the two full days; it fires as Thu 4 begins and never again in this gap.
    expect(found).toEqual([
      expect.objectContaining({
        to: 'student',
        at: at('2027-03-04', '00:00', zone),
        key: 'inactive@2027-03-01',
        expiresAt: null,
        values: expect.objectContaining({ lastActive: '2027-03-01' }),
      }),
    ])
  })

  test('to the Admin, keyed by the student, so two students with the same date give two keys', () => {
    const rule: RuleConfig = { trigger: 'inactive', days: 2, to: ['student', 'admin'] }
    const midnight = at('2027-03-04', '00:00', zone)
    const window = { from: new Date(midnight.getTime() - 10 * MINUTE), to: midnight }
    const keys = (id: string) =>
      occurrences(rule, { id, timezone: zone }, data, window).map((o) => [o.to, o.key])
    expect(keys('may')).toEqual([
      ['student', 'inactive@2027-03-01'],
      ['admin', 'may:inactive@2027-03-01'],
    ])
    expect(keys('ken')).toEqual([
      ['student', 'inactive@2027-03-01'],
      ['admin', 'ken:inactive@2027-03-01'],
    ])
  })

  test('nothing for a student who never studied', () => {
    const rule: RuleConfig = { trigger: 'inactive', days: 2, to: ['student'] }
    expect(sweep(rule, zone, noData, days('2027-03-01', '2027-03-10', zone))).toHaveLength(0)
  })
})

describe.each(ZONES)('weekly_summary in %s', (zone) => {
  const rule: RuleConfig = { trigger: 'weekly_summary', weekday: 7, time: '18:00', to: ['student'] }

  test('on the weekday and time, keyed by the week’s Monday, never lapsing', () => {
    const found = sweep(rule, zone, noData, days('2027-03-01', '2027-03-14', zone))
    expect(found.map((o) => [o.key, o.at, o.expiresAt])).toEqual([
      ['week@2027-03-01', at('2027-03-07', '18:00', zone), null],
      ['week@2027-03-08', at('2027-03-14', '18:00', zone), null],
    ])
  })

  test('the week’s facts: lessons done, study time, streak, overdue and the next 3 deadlines', () => {
    const data: StudentData = {
      shifts: [],
      activity: [
        { date: '2027-02-28', seconds: 900, completions: 0 },
        { date: '2027-03-05', seconds: 1800, completions: 1 },
        { date: '2027-03-06', seconds: 600, completions: 0 },
        { date: '2027-03-07', seconds: 1200, completions: 2 },
      ],
      lessons: [
        lesson({ lessonId: 'late', lesson: 'Late', dueAt: at('2027-03-02', '23:59', zone) }),
        lesson({ lessonId: 'd4', lesson: 'Fourth', dueAt: at('2027-03-12', '23:59', zone) }),
        lesson({ lessonId: 'd1', lesson: 'First', dueAt: at('2027-03-08', '23:59', zone) }),
        lesson({ lessonId: 'd3', lesson: 'Third', dueAt: at('2027-03-11', '23:59', zone) }),
        lesson({ lessonId: 'd2', lesson: 'Second', dueAt: at('2027-03-09', '23:59', zone) }),
        lesson({ lessonId: 'done', dueAt: at('2027-03-08', '12:00', zone), completed: true }),
      ],
    }
    const [found] = sweep(rule, zone, data, days('2027-03-07', '2027-03-07', zone))
    expect(found.values.summary).toEqual({
      lessonsDone: 3,
      studySeconds: 3600,
      streak: 3,
      overdue: 1,
      next: [
        { lesson: 'First', dueAt: at('2027-03-08', '23:59', zone) },
        { lesson: 'Second', dueAt: at('2027-03-09', '23:59', zone) },
        { lesson: 'Third', dueAt: at('2027-03-11', '23:59', zone) },
      ],
    })
  })

  test('“to admin” only gives the student nothing (the Admin’s is combined per rule)', () => {
    const adminOnly: RuleConfig = { ...rule, to: ['admin'] }
    expect(sweep(adminOnly, zone, noData, days('2027-03-07', '2027-03-07', zone))).toHaveLength(0)
  })
})

describe('the Admin’s weekly summary', () => {
  const rule: RuleConfig = {
    trigger: 'weekly_summary',
    weekday: 7,
    time: '18:00',
    to: ['student', 'admin'],
  }
  const students = [
    {
      id: 'may',
      name: 'May',
      timezone: TOKYO,
      data: { ...noData, activity: [studied('2027-03-05')] },
    },
    { id: 'ken', name: 'Ken', timezone: NEW_YORK, data: noData },
  ]

  test('one combined occurrence per rule and week, in the Admin’s clock, one line per student', () => {
    const window = {
      from: at('2027-03-07', '17:50', YANGON),
      to: at('2027-03-07', '18:00', YANGON),
    }
    const found = adminWeeklySummary(rule, { timezone: YANGON }, students, window)
    expect(found).toMatchObject({
      to: 'admin',
      at: at('2027-03-07', '18:00', YANGON),
      key: 'week@2027-03-01',
      expiresAt: null,
    })
    expect(found?.values.lines?.map((l) => [l.studentId, l.name, l.summary.studySeconds])).toEqual([
      ['may', 'May', 1200],
      ['ken', 'Ken', 0],
    ])
  })

  test('none outside the window, and none when the rule isn’t sent to the Admin', () => {
    const early = { from: at('2027-03-07', '17:30', YANGON), to: at('2027-03-07', '17:45', YANGON) }
    expect(adminWeeklySummary(rule, { timezone: YANGON }, students, early)).toBeNull()
    const window = {
      from: at('2027-03-07', '17:50', YANGON),
      to: at('2027-03-07', '18:00', YANGON),
    }
    const studentOnly: RuleConfig = { ...rule, to: ['student'] }
    expect(adminWeeklySummary(studentOnly, { timezone: YANGON }, students, window)).toBeNull()
  })
})

describe('stillApplies (research R4, FR-011)', () => {
  const dueAt = at('2027-03-05', '23:59', TOKYO)
  const key = `lesson-1@${dueAt.toISOString()}#2`
  const check = (trigger: Parameters<typeof stillApplies>[0], k: string, data: StudentData) =>
    stillApplies(trigger, k, data)

  test('due_soon and overdue: only while the lesson is open and the deadline unchanged', () => {
    expect(check('due_soon', key, { ...noData, lessons: [lesson({ dueAt })] })).toBe(true)
    expect(check('overdue', key, { ...noData, lessons: [lesson({ dueAt })] })).toBe(true)
    const done = { ...noData, lessons: [lesson({ dueAt, completed: true })] }
    expect(check('due_soon', key, done)).toBe(false)
    const moved = { ...noData, lessons: [lesson({ dueAt: new Date(dueAt.getTime() + HOUR) })] }
    expect(check('due_soon', key, moved)).toBe(false)
    expect(check('due_soon', key, { ...noData, lessons: [lesson({ dueAt: null })] })).toBe(false)
    expect(check('overdue', key, noData)).toBe(false)
  })

  test('streak_risk: only while that day has no activity', () => {
    expect(check('streak_risk', '2027-03-03', noData)).toBe(true)
    expect(
      check('streak_risk', '2027-03-03', { ...noData, activity: [studied('2027-03-03')] }),
    ).toBe(false)
  })

  test('inactive: only while there is no study after the key’s date, for either recipient', () => {
    const before = { ...noData, activity: [studied('2027-03-01')] }
    const after = { ...noData, activity: [studied('2027-03-01'), studied('2027-03-04')] }
    expect(check('inactive', 'inactive@2027-03-01', before)).toBe(true)
    expect(check('inactive', 'inactive@2027-03-01', after)).toBe(false)
    expect(check('inactive', 'may:inactive@2027-03-01', after)).toBe(false)
  })

  test('the other triggers always apply', () => {
    expect(check('daily', '2027-03-03', noData)).toBe(true)
    expect(check('weekly_summary', 'week@2027-03-01', noData)).toBe(true)
  })
})
