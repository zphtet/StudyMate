import { addCalendarDays, shiftInstants } from '@/lib/time'
import { ROTATION_LETTERS, type RotationLetter, type ShiftPresets } from './schemas'
import type { ShiftType } from './types'

// A rotation's days (spec 005 US2; research R4). Pure: local date start_date + i gets letter
// sequence[i mod length]; D, E and N take the student's preset times (FR-002) through the same
// overnight rule as a hand-entered shift (lib/time.ts shiftInstants), Night blocks sleep (US1
// scenario 4), O is a day without a shift. The repo decides which of these it may insert.

const TYPE_OF: Record<Exclude<RotationLetter, 'O'>, ShiftType> = {
  D: 'day',
  E: 'evening',
  N: 'night',
}

export type GeneratedShift = { type: ShiftType; start: Date; end: Date; blockSleep: boolean }
export type RotationDay = { date: string; letter: RotationLetter; shift: GeneratedShift | null }

const isLetter = (c: string): c is RotationLetter =>
  (ROTATION_LETTERS as readonly string[]).includes(c)

/** The letters of a rotation sequence (anything else is dropped; the schema refuses it anyway). */
export const lettersOf = (sequence: string): RotationLetter[] => [...sequence].filter(isLetter)

/** Whole days from one calendar date to another. */
function daysBetween(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

/** The rotation's days from `from` to `to` (inclusive local dates), none before its start date. */
export function rotationDays(
  pattern: { sequence: string; startDate: string },
  presets: ShiftPresets,
  timeZone: string,
  from: string,
  to: string,
): RotationDay[] {
  const letters = lettersOf(pattern.sequence)
  const { startDate } = pattern
  const days: RotationDay[] = []
  if (letters.length === 0) return days
  for (
    let date = from < startDate ? startDate : from;
    date <= to;
    date = addCalendarDays(date, 1)
  ) {
    const letter = letters[daysBetween(startDate, date) % letters.length]
    if (letter === 'O') {
      days.push({ date, letter, shift: null })
      continue
    }
    const [start, end] = presets[letter]
    const instants = shiftInstants({ date, start, end }, timeZone)
    days.push({
      date,
      letter,
      shift: {
        type: TYPE_OF[letter],
        start: instants.start,
        end: instants.end,
        blockSleep: letter === 'N',
      },
    })
  }
  return days
}
