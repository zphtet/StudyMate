'use client'

import { useNow, useTranslations } from 'next-intl'
import { useId } from 'react'
import { inputClass } from '@/components/shared/field'
import { TimeBoth } from '@/components/shared/time-both'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { utcToZoned, zonedToUtc } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ClashNotice } from './clash-notice'

// Due date + optional time, entered as the STUDENT's wall-clock time (spec 003 FR-008, research R4):
// native pickers, no time = 23:59, "No deadline" clears it. Under the fields: the student's time with
// the admin's beside it (TimeBoth), "Already overdue", optionally "Later than the course deadline",
// and the shift/sleep clash with a one-tap move. Past times are allowed (client warning only).

export function DueField({
  label,
  value,
  onChange,
  student,
  minutes = 60,
  courseDueAt,
}: {
  /** Group label, e.g. "Due" or the student's name. */
  label: string
  /** ISO instant or null (no deadline). */
  value: string | null
  onChange: (value: string | null) => void
  student: { id: string; displayName: string; timezone: string }
  /** The lesson's estimated minutes, for the clash suggestion. */
  minutes?: number
  /** When set (lesson deadlines), warns if the value is later than this course deadline. */
  courseDueAt?: string | null
}) {
  const t = useTranslations('deadlines')
  const id = useId()
  const now = useNow({ updateInterval: 60_000 })
  const local = value ? utcToZoned(value, student.timezone) : null

  const change = (date: string, time: string | null) =>
    onChange(date ? zonedToUtc(date, time || null, student.timezone).toISOString() : null)

  const isOverdue = value !== null && new Date(value) <= now
  const isAfterCourse =
    value !== null && !!courseDueAt && new Date(value).getTime() > new Date(courseDueAt).getTime()

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <Label htmlFor={`${id}-date`} className="text-sm text-muted-foreground">
            {t('dueDate')}
          </Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={local?.date ?? ''}
            onChange={(e) => change(e.target.value, local?.time ?? null)}
            className={cn(inputClass, 'h-11')}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <Label htmlFor={`${id}-time`} className="text-sm text-muted-foreground">
            {t('dueTime')}
          </Label>
          <Input
            id={`${id}-time`}
            type="time"
            value={local?.time ?? ''}
            disabled={!local}
            onChange={(e) => local && change(local.date, e.target.value)}
            className={cn(inputClass, 'h-11')}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className="min-h-11 rounded-full aria-pressed:bg-muted"
        >
          {t('noDeadline')}
        </Button>
      </div>

      {value && (
        <p className="text-sm text-muted-foreground">
          <TimeBoth at={value} timeZone={student.timezone} />
        </p>
      )}
      {isOverdue && <p className="text-sm font-medium text-destructive">{t('alreadyOverdue')}</p>}
      {isAfterCourse && (
        <p className="text-sm font-medium text-warning-foreground">{t('laterThanCourse')}</p>
      )}
      <ClashNotice
        studentId={student.id}
        studentName={student.displayName}
        timeZone={student.timezone}
        at={value}
        minutes={minutes}
        onMove={onChange}
      />
    </fieldset>
  )
}
