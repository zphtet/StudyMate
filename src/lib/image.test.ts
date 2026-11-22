// Spec 002 research.md R3 / spec 004 research.md R7: the size photos are resized to before upload.
import { describe, expect, test } from 'vitest'
import { fitWithin, MAX_IMAGE_EDGE } from './image'

describe('fitWithin', () => {
  test(`keeps images up to ${MAX_IMAGE_EDGE} px unchanged`, () => {
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 })
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 })
  })

  test('shrinks the long edge to 1600 px and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    const { width, height } = fitWithin(4032, 1908)
    expect(width).toBe(1600)
    expect(height).toBe(Math.round((1908 * 1600) / 4032))
  })
})
