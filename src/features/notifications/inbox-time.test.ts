// Spec 006 contracts/ui-routes.md › Inbox: "18:02", "Yesterday 18:02", "Fri 20 Nov", in the viewer's
// zone (constitution IV).
import { describe, expect, test } from 'vitest'
import { zonedToUtc } from '@/lib/time'
import { inboxTime } from './inbox-time'

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'
const now = zonedToUtc('2026-11-23', '10:00', TOKYO) // Mon 23 Nov, 10:00 in Tokyo

describe('inboxTime', () => {
  test('today shows the time only', () => {
    expect(inboxTime(zonedToUtc('2026-11-23', '00:00', TOKYO), now, TOKYO)).toEqual({
      kind: 'today',
      time: '00:00',
    })
  })

  test('yesterday, up to the last minute before local midnight', () => {
    expect(inboxTime(zonedToUtc('2026-11-22', '23:59', TOKYO), now, TOKYO)).toEqual({
      kind: 'yesterday',
      time: '23:59',
    })
    expect(inboxTime(zonedToUtc('2026-11-22', '00:00', TOKYO), now, TOKYO).kind).toBe('yesterday')
  })

  test('older items show their date', () => {
    expect(inboxTime(zonedToUtc('2026-11-21', '23:59', TOKYO), now, TOKYO)).toEqual({
      kind: 'date',
      date: '2026-11-21',
    })
  })

  test('the same instant reads in each viewer’s own zone', () => {
    // 23:30 Sun 22 Nov in Yangon is 02:00 Mon 23 Nov in Tokyo.
    const instant = zonedToUtc('2026-11-22', '23:30', YANGON)
    expect(inboxTime(instant, now, TOKYO)).toEqual({ kind: 'today', time: '02:00' })
    expect(inboxTime(instant, now, YANGON)).toEqual({ kind: 'yesterday', time: '23:30' })
  })
})
