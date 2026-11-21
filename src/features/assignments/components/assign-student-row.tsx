'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { checkboxClass } from '@/components/shared/field'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cityOf } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { StudentRef } from '../types'
import { DueField } from './due-field'

// One linked student in the Assign sheet (screen 23-AdminAssign): checkbox, initial, name and the
// city of their zone; when ticked, a Due field in THAT student's time (spec 003 US1 scenarios 1–2).

export function AssignStudentRow({
  student,
  assigned,
  dueAt,
  onChange,
}: {
  student: StudentRef
  assigned: boolean
  dueAt: string | null
  onChange: (next: { assigned: boolean; dueAt: string | null }) => void
}) {
  const t = useTranslations('assign')
  const id = useId()
  return (
    <li
      data-testid="assign-student"
      className={cn(
        'flex flex-col gap-3 rounded-3xl border-2 bg-card p-4',
        assigned ? 'border-primary' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={assigned}
          onCheckedChange={(checked) => onChange({ assigned: checked === true, dueAt })}
          className={checkboxClass}
        />
        <InitialAvatar name={student.displayName} seed={student.id} />
        <Label htmlFor={id} className="min-h-11 flex-1 text-lg font-semibold">
          {student.displayName}
        </Label>
        <span className="text-sm text-muted-foreground">{cityOf(student.timezone)}</span>
      </div>
      {assigned && (
        <DueField
          label={t('dueFor', { name: student.displayName })}
          value={dueAt}
          onChange={(next) => onChange({ assigned, dueAt: next })}
          student={student}
        />
      )}
    </li>
  )
}
