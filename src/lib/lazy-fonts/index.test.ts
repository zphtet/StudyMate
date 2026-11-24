import { beforeEach, describe, expect, test, vi } from 'vitest'
import { isLazyFont, loadAllLazyFonts, loadLazyFont } from './index'

// Spec 007 research R6 / T039: the two Japanese fonts load on demand. next/font only runs inside
// Next's build, so the font modules are stand-ins returning their family string.
vi.mock('./m-plus-rounded', () => ({ default: "'M PLUS Rounded 1c', 'M PLUS Fallback'" }))
vi.mock('./zen-maru', () => ({ default: "'Zen Maru Gothic', 'Zen Maru Fallback'" }))

const variable = (id: string) => document.documentElement.style.getPropertyValue(`--font-${id}`)

describe('lazy fonts', () => {
  beforeEach(() => document.documentElement.removeAttribute('style'))

  test('only M PLUS Rounded 1c and Zen Maru Gothic are lazy', () => {
    expect(isLazyFont('m-plus-rounded')).toBe(true)
    expect(isLazyFont('zen-maru')).toBe(true)
    expect(isLazyFont('inter')).toBe(false)
    expect(isLazyFont(undefined)).toBe(false)
  })

  test('loading one points its CSS variable at the font', async () => {
    await loadLazyFont('zen-maru')
    expect(variable('zen-maru')).toBe("'Zen Maru Gothic', 'Zen Maru Fallback'")
    expect(variable('m-plus-rounded')).toBe('')
  })

  test('another font is a no-op', async () => {
    await loadLazyFont('nunito')
    expect(document.documentElement.getAttribute('style')).toBeNull()
  })

  test('Appearance loads both, keeping other inline properties', async () => {
    document.documentElement.style.setProperty('--font-scale', '1.13')
    await loadAllLazyFonts()
    expect(variable('m-plus-rounded')).toContain('M PLUS Rounded 1c')
    expect(variable('zen-maru')).toContain('Zen Maru Gothic')
    expect(variable('scale')).toBe('1.13')
  })
})
