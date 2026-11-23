// Spec 006 contracts/server-actions.md › Field schemas; data-model.md NotificationRule.trigger,
// NotificationRule.config, NotificationRule.message, NotificationRule.channels, ScheduledMessage.body.
// Forms, actions, the repos and the dispatcher share these.
import { describe, expect, test } from 'vitest'
import {
  clockTime,
  DEFAULT_RULE_SET,
  messageBody,
  ruleConfig,
  ruleConfigFrom,
  ruleMessage,
  storedRule,
  weekday,
} from './rule-config'

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message
const ok = (value: unknown) => ruleConfig.safeParse(value).success

describe('clockTime and weekday', () => {
  test.each(['00:00', '07:30', '23:59'])('%s is a clock time', (time) => {
    expect(clockTime.safeParse(time).success).toBe(true)
  })
  test.each(['24:00', '7:30', '12:60', ''])('%s is refused as timeInvalid', (time) => {
    expect(firstMessage(clockTime.safeParse(time))).toBe('timeInvalid')
  })
  test('weekdays are ISO 1 (Monday) to 7', () => {
    expect([1, 7].every((d) => weekday.safeParse(d).success)).toBe(true)
    expect([0, 8, 1.5].some((d) => weekday.safeParse(d).success)).toBe(false)
  })
})

describe('ruleConfig by trigger', () => {
  test('daily: a time and 1–7 distinct days', () => {
    expect(ok({ trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] })).toBe(true)
    expect(ok({ trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5, 6, 7] })).toBe(true)
    expect(firstMessage(ruleConfig.safeParse({ trigger: 'daily', time: '20:00', days: [] }))).toBe(
      'daysEmpty',
    )
    expect(
      firstMessage(ruleConfig.safeParse({ trigger: 'daily', time: '20:00', days: [1, 1] })),
    ).toBe('daysEmpty')
    expect(ok({ trigger: 'daily', time: '20:00', days: [0] })).toBe(false)
  })

  test('after_shift: 0.5–12 hours in half-hour steps', () => {
    expect(ok({ trigger: 'after_shift', hours: 0.5 })).toBe(true)
    expect(ok({ trigger: 'after_shift', hours: 12 })).toBe(true)
    expect(ok({ trigger: 'after_shift', hours: 2.5 })).toBe(true)
    expect(ok({ trigger: 'after_shift', hours: 0 })).toBe(false)
    expect(ok({ trigger: 'after_shift', hours: 12.5 })).toBe(false)
    expect(ok({ trigger: 'after_shift', hours: 1.25 })).toBe(false)
  })

  test('due_soon: 1–3 distinct whole hours, each 1–72', () => {
    expect(ok({ trigger: 'due_soon', offsets_h: [24, 2] })).toBe(true)
    expect(ok({ trigger: 'due_soon', offsets_h: [72, 24, 1] })).toBe(true)
    for (const offsets_h of [[], [24, 24], [0], [73], [1.5], [1, 2, 3, 4]]) {
      expect(firstMessage(ruleConfig.safeParse({ trigger: 'due_soon', offsets_h }))).toBe(
        'offsetsInvalid',
      )
    }
  })

  test('overdue: a repeat time and 1–7 reminders in all', () => {
    expect(ok({ trigger: 'overdue', repeat_time: '19:00', max: 1 })).toBe(true)
    expect(ok({ trigger: 'overdue', repeat_time: '19:00', max: 7 })).toBe(true)
    expect(ok({ trigger: 'overdue', repeat_time: '19:00', max: 0 })).toBe(false)
    expect(ok({ trigger: 'overdue', repeat_time: '19:00', max: 8 })).toBe(false)
    expect(ok({ trigger: 'overdue', time: '19:00', max: 3 })).toBe(false)
  })

  test('streak_risk: a time', () => {
    expect(ok({ trigger: 'streak_risk', time: '21:30' })).toBe(true)
    expect(ok({ trigger: 'streak_risk', time: '25:00' })).toBe(false)
  })

  test('inactive: 1–14 days, to the student and/or the Admin', () => {
    expect(ok({ trigger: 'inactive', days: 1, to: ['student'] })).toBe(true)
    expect(ok({ trigger: 'inactive', days: 14, to: ['student', 'admin'] })).toBe(true)
    expect(ok({ trigger: 'inactive', days: 15, to: ['admin'] })).toBe(false)
    expect(ok({ trigger: 'inactive', days: 3, to: [] })).toBe(false)
    expect(ok({ trigger: 'inactive', days: 3, to: ['admin', 'admin'] })).toBe(false)
    expect(ok({ trigger: 'inactive', days: 3, to: ['teacher'] })).toBe(false)
  })

  test('weekly_summary: a weekday, a time and who gets it', () => {
    expect(
      ok({ trigger: 'weekly_summary', weekday: 7, time: '18:00', to: ['student', 'admin'] }),
    ).toBe(true)
    expect(ok({ trigger: 'weekly_summary', weekday: 8, time: '18:00', to: ['student'] })).toBe(
      false,
    )
    expect(ok({ trigger: 'weekly_summary', weekday: 7, time: '18:00', to: [] })).toBe(false)
  })

  test('an unknown trigger is refused', () => {
    expect(ok({ trigger: 'hourly', time: '20:00' })).toBe(false)
  })
})

describe('messages', () => {
  test('a rule message is trimmed and 1–500 characters', () => {
    expect(ruleMessage.parse('  Time to study  ')).toBe('Time to study')
    expect(firstMessage(ruleMessage.safeParse('   '))).toBe('messageEmpty')
    expect(ruleMessage.safeParse('a'.repeat(500)).success).toBe(true)
    expect(firstMessage(ruleMessage.safeParse('a'.repeat(501)))).toBe('messageTooLong')
  })

  test('a one-off message body is trimmed and 1–1000 characters', () => {
    expect(messageBody.parse(' Hi ')).toBe('Hi')
    expect(firstMessage(messageBody.safeParse(''))).toBe('messageEmpty')
    expect(messageBody.safeParse('a'.repeat(1000)).success).toBe(true)
    expect(firstMessage(messageBody.safeParse('a'.repeat(1001)))).toBe('messageTooLong')
  })
})

describe('stored rules', () => {
  test('the trigger is a column and the rest is the config, the default preset kept', () => {
    expect(
      storedRule({ trigger: 'overdue', preset: 'default', repeat_time: '19:00', max: 3 }),
    ).toEqual({
      trigger: 'overdue',
      config: { preset: 'default', repeat_time: '19:00', max: 3 },
    })
    expect(ruleConfigFrom('due_soon', { preset: 'default', offsets_h: [24, 2] })).toEqual({
      trigger: 'due_soon',
      preset: 'default',
      offsets_h: [24, 2],
    })
  })

  test('a stored config that no longer fits its trigger is refused', () => {
    expect(() => ruleConfigFrom('overdue', { time: '19:00', max: 3 })).toThrow()
  })

  test('the default set is 006 FR-008 and every rule in it parses', () => {
    expect(DEFAULT_RULE_SET).toEqual([
      { trigger: 'daily', preset: 'default', time: '20:00', days: [1, 2, 3, 4, 5] },
      { trigger: 'due_soon', preset: 'default', offsets_h: [24, 2] },
      { trigger: 'overdue', preset: 'default', repeat_time: '19:00', max: 3 },
      { trigger: 'streak_risk', preset: 'default', time: '21:30' },
    ])
    for (const rule of DEFAULT_RULE_SET) expect(ruleConfig.parse(rule)).toEqual(rule)
  })
})
