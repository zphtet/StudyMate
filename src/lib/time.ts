import { TZDate } from '@date-fns/tz'

// Time helpers (constitution IV: store UTC, judge and show dates in the viewer's own time zone).
// Spec 003 research.md R3: deadlines are entered as the student's wall-clock time and stored as
// instants; days late and Plan days follow the student's calendar, including 23/25 h DST days.

const dayFormatters = new Map<string, Intl.DateTimeFormat>()
const clockFormatters = new Map<string, Intl.DateTimeFormat>()

/** Today's calendar date (`YYYY-MM-DD`) in an IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  let format = dayFormatters.get(timeZone)
  if (!format) {
    // en-CA formats dates as YYYY-MM-DD.
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dayFormatters.set(timeZone, format)
  }
  return format.format(now)
}

function parseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/** `YYYY-MM-DD` + n days, as calendar dates (no time zone involved). */
export function addCalendarDays(date: string, days: number) {
  const { year, month, day } = parseDate(date)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * The instant of a local date and time in a zone. No time means 23:59 (spec 003 Edge Cases). A time
 * that doesn't exist on a daylight-saving change day moves forward by the gap (02:30 → 03:30).
 */
export function zonedToUtc(date: string, time: string | null, timeZone: string): Date {
  const { year, month, day } = parseDate(date)
  const [hours, minutes] = (time ?? '23:59').split(':').map(Number)
  return new Date(new TZDate(year, month - 1, day, hours, minutes, timeZone).getTime())
}

/** Local `{ date: 'YYYY-MM-DD', time: 'HH:mm' }` of an instant, e.g. for date and time inputs. */
export function utcToZoned(instant: Date | string, timeZone: string) {
  // Intl, like todayIn: reading a TZDate's getHours() gave the browser's own zone under
  // Playwright's fake clock (spec 006 T082), and Intl needs no Date subclass.
  let format = clockFormatters.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    clockFormatters.set(timeZone, format)
  }
  const part = Object.fromEntries(
    format.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  )
  return { date: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}` }
}

/** Calendar days from `earlier` to `later`, both read in the zone (23:59 → 00:01 is 1 day). */
export function calendarDaysBetween(earlier: Date, later: Date, timeZone: string): number {
  const days = (date: string) => {
    const { year, month, day } = parseDate(date)
    return Date.UTC(year, month - 1, day) / 86_400_000
  }
  return days(todayIn(timeZone, later)) - days(todayIn(timeZone, earlier))
}

/** The Monday of a calendar date's week (`YYYY-MM-DD`; weeks run Monday to Sunday). */
export function mondayOf(date: string) {
  const { year, month, day } = parseDate(date)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0 = Sunday
  return addCalendarDays(date, -((weekday + 6) % 7))
}

/** `YYYY-MM` + n months (Plan and calendar months). */
export function addMonths(month: string, months: number) {
  const [year, m] = month.split('-').map(Number)
  return new Date(Date.UTC(year, m - 1 + months, 1)).toISOString().slice(0, 7)
}

/** Every `YYYY-MM-DD` of a `YYYY-MM` month, in order. */
export function datesOfMonth(month: string): string[] {
  const dates: string[] = []
  for (let date = `${month}-01`; date.startsWith(month); date = addCalendarDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

/** The same local clock time on another local date (Plan drag; correct across DST changes). */
export function moveToDay(instant: Date, date: string, timeZone: string): Date {
  return zonedToUtc(date, utcToZoned(instant, timeZone).time, timeZone)
}

/** 00:00 of a local date as an instant. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  return zonedToUtc(date, '00:00', timeZone)
}

/** The real bounds of a local day: 23 or 25 hours long on a DST change. */
export function localDayRange(date: string, timeZone: string) {
  return {
    start: startOfLocalDay(date, timeZone),
    end: startOfLocalDay(addCalendarDays(date, 1), timeZone),
  }
}

/**
 * A shift's instants from the form's local date and clock times (spec 005 FR-001, US1 scenario 2;
 * research R2). An end at or before the start is on the next local date, so 22:00–07:00 is one
 * overnight shift and 08:00–08:00 is 24 h. Without times (an Off day) it is the whole local day.
 * `minutes` comes from the instants, so a daylight-saving night is an hour longer or shorter
 * (constitution IV); saving refuses more than 24 h.
 */
export function shiftInstants(
  shift: { date: string } & ({ start: string; end: string } | { start: null; end: null }),
  timeZone: string,
) {
  const { date, start, end } = shift
  const endsNextDay = start !== null && end <= start
  const bounds =
    start === null
      ? localDayRange(date, timeZone)
      : {
          start: zonedToUtc(date, start, timeZone),
          end: zonedToUtc(endsNextDay ? addCalendarDays(date, 1) : date, end, timeZone),
        }
  return {
    ...bounds,
    minutes: (bounds.end.getTime() - bounds.start.getTime()) / 60_000,
    endsNextDay,
  }
}

/**
 * The next whole hour on the local clock (unchanged when already on one). Rounding in UTC would be
 * wrong for half-hour zones such as Asia/Yangon (+06:30). Offsets are whole quarter hours and DST
 * changes happen on the hour, so adding the local minutes left in the hour is enough.
 */
export function roundUpToLocalHour(instant: Date, timeZone: string): Date {
  const local = new TZDate(instant.getTime(), timeZone)
  const intoHour = local.getMinutes() * 60_000 + local.getSeconds() * 1000 + local.getMilliseconds()
  return intoHour === 0 ? instant : new Date(instant.getTime() + 3_600_000 - intoHour)
}

/** "Asia/Tokyo" → "Tokyo", "America/New_York" → "New York" (labels next to times). */
export function cityOf(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ')
}

/**
 * Prisma reads and writes `time` columns (waking hours, quiet hours) as 1970-01-01 instants in UTC;
 * the app uses the clock `HH:mm`.
 */
export const toClock = (time: Date) => time.toISOString().slice(11, 16)
export const fromClock = (clock: string) => new Date(`1970-01-01T${clock}:00Z`)
