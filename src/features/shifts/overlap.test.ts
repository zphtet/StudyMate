import { describe, expect, it } from 'vitest'
import { zonedToUtc } from '@/lib/time'
import { findLocalOverlap } from './overlap'
import type { ShiftView } from './types'

// Spec 008 contracts/ui-routes.md (shifts offline): before queueing a shift, the device checks it
// against the shifts it has cached, with the server's rule (repo.ts findOverlap; spec 005 FR-003).

const TOKYO = 'Asia/Tokyo'
const at = (date: string, time: string) => zonedToUtc(date, time, TOKYO)

function shift(id: string, type: ShiftView['type'], start: Date, end: Date): ShiftView {
  return {
    id,
    type,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    sleepMinutes: 0,
    fromRotation: false,
    overridden: false,
    updatedAt: start.toISOString(),
  }
}

const night = shift('n', 'night', at('2026-12-04', '22:00'), at('2026-12-05', '07:00'))
const off = shift('o', 'off', at('2026-12-06', '00:00'), at('2026-12-07', '00:00'))
const cached = [night, off]

describe('findLocalOverlap', () => {
  it('finds a working shift that overlaps, across midnight', () => {
    expect(
      findLocalOverlap(cached, {
        start: at('2026-12-05', '06:00'),
        end: at('2026-12-05', '10:00'),
      }),
    ).toBe(night)
  })

  it('lets shifts touch end to start', () => {
    expect(
      findLocalOverlap(cached, {
        start: at('2026-12-05', '07:00'),
        end: at('2026-12-05', '12:00'),
      }),
    ).toBeNull()
  })

  it('never clashes with an Off day', () => {
    expect(
      findLocalOverlap(cached, {
        start: at('2026-12-06', '09:00'),
        end: at('2026-12-06', '18:00'),
      }),
    ).toBeNull()
  })

  it('leaves out the shift being edited', () => {
    expect(
      findLocalOverlap(cached, {
        start: at('2026-12-04', '23:00'),
        end: at('2026-12-05', '08:00'),
        exceptId: 'n',
      }),
    ).toBeNull()
  })
})
