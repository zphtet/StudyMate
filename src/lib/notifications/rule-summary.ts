import type { RuleConfig } from './rule-config'

// What a rule row shows on Alerts and My reminders (spec 006 contracts/ui-routes.md › Alerts): a type
// badge, a title and a one-line summary ("20:00 · Mon–Fri", "Nudge May · alert me"). Pure: the screens
// turn these keys and values into text in the viewer's language. A student is named, never "she/he"
// (FR-012); a rule for All students has no single name.

export type RuleBadge = 'DAY' | 'SHIFT' | 'DUE' | 'LATE' | 'FIRE' | 'IDLE' | 'WEEK'

/** A daily rule's days: every day, a run of three or more ("Mon–Fri"), or a list in week order. */
export type DaysLabel =
  { kind: 'every' } | { kind: 'range'; from: number; to: number } | { kind: 'list'; days: number[] }

export type Recipients = 'student' | 'admin' | 'both'

export type RuleSummaryText =
  | { key: 'daily'; time: string; days: DaysLabel }
  | { key: 'after_shift'; hours: number }
  | { key: 'due_soon'; hours: number[] }
  | { key: 'overdue'; time: string; max: number }
  | { key: 'streak_risk'; time: string }
  | { key: 'inactive'; to: Recipients; name: string | null }
  | { key: 'weekly_summary'; weekday: number; time: string; to: Recipients; name: string | null }

export type RuleSummary = {
  badge: RuleBadge
  title: { key: RuleConfig['trigger']; days?: number }
  summary: RuleSummaryText
}

const BADGES: Record<RuleConfig['trigger'], RuleBadge> = {
  daily: 'DAY',
  after_shift: 'SHIFT',
  due_soon: 'DUE',
  overdue: 'LATE',
  streak_risk: 'FIRE',
  inactive: 'IDLE',
  weekly_summary: 'WEEK',
}

/** Three or more days in a row read as a range; fewer would read oddly ("Mon–Tue"). */
const MIN_RANGE = 3

function daysLabel(days: readonly number[]): DaysLabel {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return { kind: 'every' }
  const isRun = sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1)
  if (isRun && sorted.length >= MIN_RANGE) {
    return { kind: 'range', from: sorted[0], to: sorted[sorted.length - 1] }
  }
  return { kind: 'list', days: sorted }
}

function recipients(to: readonly ('student' | 'admin')[]): Recipients {
  if (to.includes('student') && to.includes('admin')) return 'both'
  return to.includes('admin') ? 'admin' : 'student'
}

function summaryOf(config: RuleConfig, name: string | null): RuleSummaryText {
  switch (config.trigger) {
    case 'daily':
      return { key: 'daily', time: config.time, days: daysLabel(config.days) }
    case 'after_shift':
      return { key: 'after_shift', hours: config.hours }
    case 'due_soon':
      return { key: 'due_soon', hours: [...config.offsets_h].sort((a, b) => b - a) }
    case 'overdue':
      return { key: 'overdue', time: config.repeat_time, max: config.max }
    case 'streak_risk':
      return { key: 'streak_risk', time: config.time }
    case 'inactive':
      return { key: 'inactive', to: recipients(config.to), name }
    case 'weekly_summary':
      return {
        key: 'weekly_summary',
        weekday: config.weekday,
        time: config.time,
        to: recipients(config.to),
        name,
      }
  }
}

/** `studentName` is the student the rule applies to, or null for All students. */
export function ruleSummary(rule: { config: RuleConfig }, studentName: string | null): RuleSummary {
  const { config } = rule
  return {
    badge: BADGES[config.trigger],
    title:
      config.trigger === 'inactive'
        ? { key: config.trigger, days: config.days }
        : { key: config.trigger },
    summary: summaryOf(config, studentName),
  }
}
