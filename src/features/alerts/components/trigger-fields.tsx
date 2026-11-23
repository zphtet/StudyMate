'use client'

import { Minus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Field, inputClass } from '@/components/shared/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RuleConfig } from '@/lib/notifications/rule-config'
import { cn } from '@/lib/utils'

// The rule editor's chips and timing fields (26-AdminRule.png; contracts/ui-routes.md › Rule editor).
// Controlled: the editor owns the config, these fields edit one trigger's shape at a time
// (data-model.md › Config by trigger). Times are the student's own clock.

type Trigger = RuleConfig['trigger']
export const TRIGGERS: Trigger[] = [
  'daily',
  'after_shift',
  'due_soon',
  'overdue',
  'streak_risk',
  'inactive',
  'weekly_summary',
]
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step)
const MAX_OFFSETS = 3

/** A chip that is a real radio or checkbox covering the whole chip (≥ 44 px; like Segmented). */
function Chip({
  type,
  name,
  checked,
  onChange,
  children,
}: {
  type: 'radio' | 'checkbox'
  name?: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        'relative flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-card px-4 font-medium transition-colors',
        'has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground',
        'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full outline-none"
      />
      <span className="pointer-events-none relative">{children}</span>
    </label>
  )
}

export function TriggerChips({
  name,
  value,
  onChange,
}: {
  name: string
  value: Trigger
  onChange: (trigger: Trigger) => void
}) {
  const t = useTranslations('ruleEditor')
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 font-semibold text-muted-foreground">{t('when')}</legend>
      <div className="flex flex-wrap gap-2">
        {TRIGGERS.map((trigger) => (
          <Chip
            key={trigger}
            type="radio"
            name={name}
            checked={value === trigger}
            onChange={() => onChange(trigger)}
          >
            {t(`trigger.${trigger}`)}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: number
  options: { value: number; label: string }[]
  onChange: (value: number) => void
}) {
  return (
    <Field id={id} label={label}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputClass} w-full border border-input`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

function TimeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </Field>
  )
}

/** Who gets an Inactive alert or a Weekly summary: the student (named), the Admin, or both. */
function Recipients({
  value,
  onChange,
  studentName,
}: {
  value: ('student' | 'admin')[]
  onChange: (to: ('student' | 'admin')[]) => void
  studentName: string | null
}) {
  const t = useTranslations('ruleEditor')
  const toggle = (who: 'student' | 'admin') =>
    onChange(value.includes(who) ? value.filter((w) => w !== who) : [...value, who])
  return (
    <fieldset className="col-span-2 flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">{t('who')}</legend>
      <div className="flex flex-wrap gap-2">
        <Chip
          type="checkbox"
          checked={value.includes('student')}
          onChange={() => toggle('student')}
        >
          {studentName ?? t('toEachStudent')}
        </Chip>
        <Chip type="checkbox" checked={value.includes('admin')} onChange={() => toggle('admin')}>
          {t('toMe')}
        </Chip>
      </div>
    </fieldset>
  )
}

export function TriggerFields({
  uid,
  config,
  onChange,
  studentName,
}: {
  uid: string
  config: RuleConfig
  onChange: (config: RuleConfig) => void
  /** The student the rule applies to; null for All students. */
  studentName: string | null
}) {
  const t = useTranslations('ruleEditor')
  const ts = useTranslations('ruleSummary')
  const hours = (h: number) => ({ value: h, label: t('hoursValue', { hours: h }) })

  switch (config.trigger) {
    case 'daily':
      return (
        <>
          <TimeInput
            id={`${uid}-time`}
            label={t('time')}
            value={config.time}
            onChange={(time) => onChange({ ...config, time })}
          />
          <fieldset className="col-span-2 flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-muted-foreground">{t('days')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <Chip
                  key={day}
                  type="checkbox"
                  checked={config.days.includes(day)}
                  onChange={() =>
                    onChange({
                      ...config,
                      days: config.days.includes(day)
                        ? config.days.filter((d) => d !== day)
                        : [...config.days, day].sort((a, b) => a - b),
                    })
                  }
                >
                  {ts('weekday', { day })}
                </Chip>
              ))}
            </div>
          </fieldset>
        </>
      )

    case 'after_shift':
      return (
        <Select
          id={`${uid}-hours`}
          label={t('hoursAfter')}
          value={config.hours}
          options={range(0.5, 12, 0.5).map(hours)}
          onChange={(value) => onChange({ ...config, hours: value })}
        />
      )

    case 'due_soon':
      return (
        <div className="col-span-2 flex flex-col gap-3">
          {config.offsets_h.map((offset, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field
                id={`${uid}-offset-${i}`}
                label={t('hoursBefore', { n: i + 1 })}
                className="flex-1"
              >
                <Input
                  id={`${uid}-offset-${i}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={72}
                  value={Number.isNaN(offset) ? '' : offset}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      offsets_h: config.offsets_h.map((o, j) =>
                        j === i ? Number.parseInt(e.target.value, 10) : o,
                      ),
                    })
                  }
                  className={inputClass}
                />
              </Field>
              {config.offsets_h.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-touch"
                  aria-label={t('removeOffset', { hours: offset })}
                  onClick={() =>
                    onChange({ ...config, offsets_h: config.offsets_h.filter((_, j) => j !== i) })
                  }
                >
                  <Minus aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {config.offsets_h.length < MAX_OFFSETS && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="self-start"
              onClick={() => onChange({ ...config, offsets_h: [...config.offsets_h, 1] })}
            >
              <Plus aria-hidden />
              {t('addOffset')}
            </Button>
          )}
        </div>
      )

    case 'overdue':
      return (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">{t('firstReminder')}</p>
            <p className="flex h-13 items-center rounded-2xl border border-input bg-muted px-4">
              {t('atDeadline')}
            </p>
          </div>
          <TimeInput
            id={`${uid}-repeat`}
            label={t('repeatAt')}
            value={config.repeat_time}
            onChange={(repeat_time) => onChange({ ...config, repeat_time })}
          />
          <Select
            id={`${uid}-max`}
            label={t('stopAfter')}
            value={config.max}
            options={range(1, 7).map((count) => ({
              value: count,
              label: t('remindersCount', { count }),
            }))}
            onChange={(max) => onChange({ ...config, max })}
          />
        </>
      )

    case 'streak_risk':
      return (
        <TimeInput
          id={`${uid}-time`}
          label={t('time')}
          value={config.time}
          onChange={(time) => onChange({ ...config, time })}
        />
      )

    case 'inactive':
      return (
        <>
          <Select
            id={`${uid}-days`}
            label={t('inactiveDays')}
            value={config.days}
            options={range(1, 14).map((days) => ({ value: days, label: t('daysCount', { days }) }))}
            onChange={(days) => onChange({ ...config, days })}
          />
          <Recipients
            value={config.to}
            onChange={(to) => onChange({ ...config, to })}
            studentName={studentName}
          />
        </>
      )

    case 'weekly_summary':
      return (
        <>
          <Select
            id={`${uid}-weekday`}
            label={t('weekday')}
            value={config.weekday}
            options={WEEKDAYS.map((day) => ({ value: day, label: ts('weekdayLong', { day }) }))}
            onChange={(weekday) => onChange({ ...config, weekday })}
          />
          <TimeInput
            id={`${uid}-time`}
            label={t('time')}
            value={config.time}
            onChange={(time) => onChange({ ...config, time })}
          />
          <Recipients
            value={config.to}
            onChange={(to) => onChange({ ...config, to })}
            studentName={studentName}
          />
        </>
      )
  }
}
