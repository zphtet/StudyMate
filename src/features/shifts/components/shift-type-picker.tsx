'use client'

import { useTranslations } from 'next-intl'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ShiftType } from '@/generated/prisma/enums'
import type { ShiftType as Type } from '../types'
import { ShiftSwatch } from './shift-chip'

const TYPES = Object.values(ShiftType)

/**
 * The five type tiles of 08-ShiftEdit (Day, Evening, Night, Off, Custom): a radio group (Radix
 * single toggle group), arrow keys between tiles, each at least 44 px tall (constitution V).
 */
export function ShiftTypePicker({
  value,
  onChange,
  labelId,
}: {
  value: Type
  onChange: (type: Type) => void
  /** id of the visible "Shift type" label */
  labelId: string
}) {
  const t = useTranslations('shifts.types')
  return (
    <ToggleGroup
      type="single"
      value={value}
      // A single toggle group lets the pressed tile be pressed off; a shift always has a type.
      onValueChange={(next) => next && onChange(next as Type)}
      aria-labelledby={labelId}
      spacing={2}
      className="grid w-full grid-cols-5"
    >
      {TYPES.map((type) => (
        <ToggleGroupItem
          key={type}
          value={type}
          className="flex h-auto min-h-16 flex-col gap-2 rounded-2xl border bg-card px-1 py-3 text-sm font-medium data-[state=on]:border-2 data-[state=on]:border-primary data-[state=on]:bg-accent"
        >
          <ShiftSwatch type={type} />
          <span className="truncate">{t(type)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
