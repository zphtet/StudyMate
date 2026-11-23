'use client'

import { useTranslations } from 'next-intl'
import { CalendarMonth } from '@/components/shared/calendar-month'
import { cn } from '@/lib/utils'
import { monthChips } from '../calendar'
import type { ShiftView } from '../types'
import { ShiftChip } from './shift-chip'
import { useShiftName } from './use-shift-name'

/**
 * 07-Shifts month: 003's CalendarMonth with the shift chips in each day's badge slot (research R5).
 * Each day's accessible name ends with its shifts in words; the selected day is highlighted and says
 * so.
 */
export function ShiftCalendar({
  month,
  today,
  timeZone,
  shifts,
  selected,
  onSelectDay,
}: {
  month: string
  today: string
  timeZone: string
  shifts: ShiftView[]
  selected: string
  onSelectDay: (date: string) => void
}) {
  const t = useTranslations('shifts')
  const shiftName = useShiftName(timeZone)
  const chips = monthChips(shifts, timeZone, month)

  return (
    <CalendarMonth
      month={month}
      today={today}
      onSelectDay={onSelectDay}
      dayClassName={(date) =>
        cn(
          'gap-1 px-0',
          date === selected && date !== today && 'bg-accent',
          date === selected && 'ring-2 ring-primary ring-inset',
        )
      }
      badge={(date) => {
        const list = chips.get(date) ?? []
        const words = list.map((chip) => shiftName(chip.shift))
        return (
          <>
            {list.map((chip) => (
              <ShiftChip
                key={`${chip.shift.id}-${chip.part}`}
                type={chip.shift.type}
                part={chip.part}
              >
                {chip.shift.type === 'off' ? t('types.off') : chip.label}
              </ShiftChip>
            ))}
            {(words.length > 0 || date === selected) && (
              <span className="sr-only">
                {words.length > 0 && `, ${words.join(', ')}`}
                {date === selected && `, ${t('selected')}`}
              </span>
            )}
          </>
        )
      }}
    />
  )
}
