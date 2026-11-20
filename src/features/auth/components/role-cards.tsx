'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { Role } from '../schemas'

// Student / Admin radio cards (screenshots 01, 02, 13, 14). A real radio group for keyboard and
// screen-reader users; the whole card is the tap target.
export function RoleCards({
  value,
  onChange,
  hints,
  legend,
  name = 'role',
}: {
  value: Role
  onChange: (role: Role) => void
  hints: Record<Role, string>
  legend?: string
  name?: string
}) {
  const t = useTranslations('common')
  return (
    <fieldset className="flex flex-col gap-3">
      {legend && <legend className="mb-3 text-sm font-medium">{legend}</legend>}
      <div className="grid grid-cols-2 gap-3">
        {(['student', 'admin'] as const).map((role) => {
          const checked = value === role
          return (
            <label
              key={role}
              className={cn(
                'relative flex cursor-pointer flex-col gap-1.5 rounded-2xl border-2 bg-card p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                checked ? 'border-primary bg-accent' : 'border-border hover:border-input',
              )}
            >
              <input
                type="radio"
                name={name}
                value={role}
                checked={checked}
                onChange={() => onChange(role)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-2">
                <span className="text-lg font-semibold">{t(role)}</span>
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                    checked ? 'border-primary bg-primary' : 'border-muted-foreground/60',
                  )}
                >
                  {checked && <span className="size-2.5 rounded-full bg-primary-foreground" />}
                </span>
              </span>
              <span className="text-sm leading-snug text-muted-foreground">{hints[role]}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
