import { utcToZoned } from '@/lib/time'
import type { ShiftView } from './types'

// The month calendar's shift chips (spec 005 US1 scenario 3; research R5). Pure: shifts in, chips per
// local date out. An overnight shift is one record and two chips: "22→" on its start date (`start`,
// square on the right) and "→07" on the next (`end`, square on the left), so they read as one bar
// across the cell border, also across the Sunday→Monday row break.

export type ChipPart = 'whole' | 'start' | 'end'
export type ShiftChip = { shift: ShiftView; part: ChipPart; label: string }

/** "9", "9:30" (the screenshot's "9–18"); `padded` gives "07" for the end chip ("→07"). */
function hourLabel(time: string, padded = false) {
  const [hours, minutes] = time.split(':')
  const hour = padded ? hours : String(Number(hours))
  return minutes === '00' ? hour : `${hour}:${minutes}`
}

/** The chips of each date of `month` (YYYY-MM), in start order, read in `timeZone`. */
export function monthChips(
  shifts: readonly ShiftView[],
  timeZone: string,
  month: string,
): Map<string, ShiftChip[]> {
  const chips = new Map<string, ShiftChip[]>()
  const add = (date: string, chip: ShiftChip) => {
    if (date.startsWith(month)) chips.set(date, [...(chips.get(date) ?? []), chip])
  }
  const sorted = [...shifts].sort((a, b) => a.startAt.localeCompare(b.startAt))
  for (const shift of sorted) {
    const start = utcToZoned(shift.startAt, timeZone)
    const end = utcToZoned(shift.endAt, timeZone)
    // The last minute decides the end date: a shift ending at 00:00 stays on its day ("14–24").
    const lastDate = utcToZoned(new Date(new Date(shift.endAt).getTime() - 1), timeZone).date
    if (shift.type === 'off') {
      add(start.date, { shift, part: 'whole', label: '' })
    } else if (lastDate === start.date) {
      const endLabel = end.date === start.date ? hourLabel(end.time) : '24'
      add(start.date, { shift, part: 'whole', label: `${hourLabel(start.time)}–${endLabel}` })
    } else {
      add(start.date, { shift, part: 'start', label: `${hourLabel(start.time)}→` })
      add(lastDate, { shift, part: 'end', label: `→${hourLabel(end.time, true)}` })
    }
  }
  // The end of last night's shift comes before anything that starts on the day.
  for (const list of chips.values()) {
    list.sort((a, b) => Number(b.part === 'end') - Number(a.part === 'end'))
  }
  return chips
}
