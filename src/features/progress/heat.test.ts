// @vitest-environment node
// Spec 004 research.md R5: the five shades of the Progress calendar by study time in a day.
import { describe, expect, test } from 'vitest'
import { heatLevel } from './heat'

describe('heatLevel', () => {
  test.each([
    [0, 0],
    [1, 1],
    [14 * 60 + 59, 1],
    [15 * 60, 2],
    [29 * 60 + 59, 2],
    [30 * 60, 3],
    [59 * 60 + 59, 3],
    [60 * 60, 4],
    [5 * 3600, 4],
  ])('%i s → level %i', (seconds, level) => {
    expect(heatLevel(seconds)).toBe(level)
  })
})
