import { addCalendarDays, todayIn, zonedToUtc } from '@/lib/time'

// The composer's quick times (spec 006 US3 scenario 3; research R11): 15:00, 18:00 and 22:00 on the
// chosen clock (the student's or the Admin's). A time already past today rolls to tomorrow and says
// so ("15:00 tomorrow"). Pure, so both clocks and daylight saving are unit-tested.

export const QUICK_TIMES = ['15:00', '18:00', '22:00'] as const

export type QuickTime = { time: (typeof QUICK_TIMES)[number]; at: Date; tomorrow: boolean }

export function quickTimes(now: Date, timeZone: string): QuickTime[] {
  const today = todayIn(timeZone, now)
  return QUICK_TIMES.map((time) => {
    const at = zonedToUtc(today, time, timeZone)
    if (at > now) return { time, at, tomorrow: false }
    return { time, at: zonedToUtc(addCalendarDays(today, 1), time, timeZone), tomorrow: true }
  })
}
