// @vitest-environment node
// Spec 005 US4 scenarios 1 and 3; research R8: what the Admin's student card says about the
// student's live status. The words and the "· 05:30 yours" part are formatted by the hook; this is
// the choice of line and whether the time needs its weekday.
import { describe, expect, test } from 'vitest'
import { statusLine } from './status-text'

const now = new Date('2026-12-10T03:00:00Z')
const later = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString()

describe('statusLine', () => {
  test('on shift: the type of the running shift and when it ends', () => {
    expect(statusLine({ state: 'on_shift', until: later(6), shiftType: 'night' }, now)).toEqual({
      kind: 'on_shift',
      shiftType: 'night',
      until: new Date(later(6)),
      showWeekday: false,
    })
  })

  test('sleeping until the end of the sleep block (or the night)', () => {
    expect(statusLine({ state: 'sleeping', until: later(2), shiftType: null }, now)).toEqual({
      kind: 'sleeping',
      until: new Date(later(2)),
      showWeekday: false,
    })
  })

  test('free now, with no time', () => {
    expect(statusLine({ state: 'free', until: later(8), shiftType: null }, now)).toEqual({
      kind: 'free',
    })
  })

  test('no shifts entered: no shift info (scenario 3)', () => {
    expect(statusLine({ state: 'unknown', until: null, shiftType: null }, now)).toEqual({
      kind: 'unknown',
    })
  })

  test('a change more than a day away also shows its weekday', () => {
    expect(statusLine({ state: 'sleeping', until: later(24), shiftType: null }, now)).toMatchObject(
      {
        showWeekday: false,
      },
    )
    expect(statusLine({ state: 'sleeping', until: later(25), shiftType: null }, now)).toMatchObject(
      {
        showWeekday: true,
      },
    )
  })

  test('no next change within 2 days: the line has no time', () => {
    expect(statusLine({ state: 'on_shift', until: null, shiftType: 'day' }, now)).toEqual({
      kind: 'on_shift',
      shiftType: 'day',
      until: null,
      showWeekday: false,
    })
  })
})
