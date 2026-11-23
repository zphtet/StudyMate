// Spec 006 T050: the composer's quick times (research R11; US3 scenario 3): 15:00, 18:00 and 22:00
// in the chosen clock, rolling to tomorrow once past. Mon 1 Mar 2027 is a Monday; New York springs
// forward on Sun 14 Mar 2027.
import { describe, expect, test } from 'vitest'
import { utcToZoned, zonedToUtc } from '@/lib/time'
import { quickTimes } from './quick-times'

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'
const NEW_YORK = 'America/New_York'

describe('quickTimes', () => {
  test('at 16:00 Tokyo: 15:00 tomorrow, 18:00 and 22:00 today', () => {
    const now = zonedToUtc('2027-03-03', '16:00', TOKYO)
    expect(quickTimes(now, TOKYO)).toEqual([
      { time: '15:00', at: zonedToUtc('2027-03-04', '15:00', TOKYO), tomorrow: true },
      { time: '18:00', at: zonedToUtc('2027-03-03', '18:00', TOKYO), tomorrow: false },
      { time: '22:00', at: zonedToUtc('2027-03-03', '22:00', TOKYO), tomorrow: false },
    ])
  })

  test('a time exactly now counts as past', () => {
    const now = zonedToUtc('2027-03-03', '18:00', TOKYO)
    expect(quickTimes(now, TOKYO)[1]).toMatchObject({ tomorrow: true })
  })

  test('18:00 May’s time (Tokyo) is 15:30 in Yangon', () => {
    const now = zonedToUtc('2027-03-03', '16:00', TOKYO)
    const eighteen = quickTimes(now, TOKYO)[1]
    expect(utcToZoned(eighteen.at, YANGON)).toEqual({ date: '2027-03-03', time: '15:30' })
  })

  test('in Yangon’s own clock (+06:30)', () => {
    const now = zonedToUtc('2027-03-03', '09:00', YANGON)
    expect(quickTimes(now, YANGON).map((q) => q.at.toISOString())).toEqual([
      '2027-03-03T08:30:00.000Z',
      '2027-03-03T11:30:00.000Z',
      '2027-03-03T15:30:00.000Z',
    ])
  })

  test('New York’s spring-forward day keeps local times', () => {
    const before = zonedToUtc('2027-03-13', '23:00', NEW_YORK)
    expect(quickTimes(before, NEW_YORK).map((q) => [q.at.toISOString(), q.tomorrow])).toEqual([
      ['2027-03-14T19:00:00.000Z', true],
      ['2027-03-14T22:00:00.000Z', true],
      ['2027-03-15T02:00:00.000Z', true],
    ])
  })
})
