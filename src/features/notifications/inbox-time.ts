import { addCalendarDays, todayIn, utcToZoned } from '@/lib/time'

// When an inbox item arrived, as the inbox shows it (contracts/ui-routes.md › Inbox): "18:02",
// "Yesterday 18:02" or "Fri 20 Nov", in the viewer's zone (constitution IV). The component formats
// the parts in the viewer's language.

export type InboxTime =
  { kind: 'today' | 'yesterday'; time: string } | { kind: 'date'; date: string }

export function inboxTime(at: Date | string, now: Date, timeZone: string): InboxTime {
  const local = utcToZoned(at, timeZone)
  const today = todayIn(timeZone, now)
  if (local.date === today) return { kind: 'today', time: local.time }
  if (local.date === addCalendarDays(today, -1)) return { kind: 'yesterday', time: local.time }
  return { kind: 'date', date: local.date }
}
