import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { acceptedTime, MAX_OFFLINE_AGE_MS, MAX_SKEW_MS } from './accepted-time'

// Spec 008 FR-003c; research R8; data-model.md › Validation rules: a queued change keeps the time
// the student acted, within a bounded window; otherwise the server's time is used.

const NOW = new Date('2026-11-24T09:00:00Z')
const minutes = (n: number) => n * 60_000
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('acceptedTime', () => {
  it('keeps the device time inside the window', () => {
    expect(acceptedTime({ at: ago(minutes(10)), serverNow: NOW, base: null })).toEqual(
      new Date(ago(minutes(10))),
    )
    expect(acceptedTime({ at: ago(MAX_OFFLINE_AGE_MS), serverNow: NOW, base: null })).toEqual(
      new Date(ago(MAX_OFFLINE_AGE_MS)),
    )
  })

  it('treats a slightly fast device clock as now', () => {
    expect(acceptedTime({ at: ago(-minutes(1)), serverNow: NOW, base: null })).toEqual(NOW)
    expect(acceptedTime({ at: ago(-MAX_SKEW_MS), serverNow: NOW, base: null })).toEqual(NOW)
  })

  it('uses server time for a far-future, too old, or unreadable time', () => {
    expect(acceptedTime({ at: ago(-minutes(3)), serverNow: NOW, base: null })).toEqual(NOW)
    expect(acceptedTime({ at: ago(MAX_OFFLINE_AGE_MS + 1), serverNow: NOW, base: null })).toEqual(
      NOW,
    )
    expect(acceptedTime({ at: 'yesterday', serverNow: NOW, base: null })).toEqual(NOW)
  })

  it('never goes back before the version the change was made on (FR-003c)', () => {
    const base = new Date(ago(minutes(5)))
    expect(acceptedTime({ at: ago(minutes(10)), serverNow: NOW, base })).toEqual(NOW)
    expect(acceptedTime({ at: ago(minutes(2)), serverNow: NOW, base })).toEqual(
      new Date(ago(minutes(2))),
    )
  })

  it('is never after server time, nor before the earliest allowed moment', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -minutes(60 * 24 * 30), max: minutes(60 * 24 * 30) }),
        fc.option(fc.integer({ min: 0, max: minutes(60 * 24 * 30) })),
        (offset, baseAgo) => {
          const base = baseAgo === null ? null : new Date(NOW.getTime() - baseAgo)
          const result = acceptedTime({ at: ago(offset), serverNow: NOW, base })
          const floor = Math.min(
            NOW.getTime(),
            Math.max(NOW.getTime() - MAX_OFFLINE_AGE_MS, base?.getTime() ?? -Infinity),
          )
          expect(result.getTime()).toBeLessThanOrEqual(NOW.getTime())
          expect(result.getTime()).toBeGreaterThanOrEqual(floor)
        },
      ),
    )
  })
})
