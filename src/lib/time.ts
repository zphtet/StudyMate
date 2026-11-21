// Time helpers (constitution IV: store UTC, judge and show dates in the viewer's own time zone).

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

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
