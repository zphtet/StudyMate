import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  APPEARANCE_COOKIE,
  appearanceScript,
  applyAppearance,
  defaultAppearance,
  fontIds,
  fonts,
  parseAppearanceCookie,
  serializeAppearance,
  themeIds,
  themes,
  toFontScale,
  toTextSize,
  type Appearance,
} from './appearance'

// Spec 007 research R1 (the appearance cookie and the pre-paint script), R7 (text size);
// data-model.md › Profile.theme_id, Profile.font_id, Profile.font_scale, › Device state.

describe('the lists', () => {
  test('theme ids are the ten in data-model.md Profile.theme_id', () => {
    expect([...themeIds]).toEqual([
      'indigo',
      'ocean',
      'teal',
      'forest',
      'sunset',
      'rose',
      'sakura',
      'lavender',
      'slate',
      'mocha',
    ])
  })

  test('font ids are the ten in data-model.md Profile.font_id', () => {
    expect([...fontIds]).toEqual([
      'inter',
      'nunito',
      'poppins',
      'dm-sans',
      'manrope',
      'roboto',
      'atkinson',
      'merriweather',
      'm-plus-rounded',
      'zen-maru',
    ])
  })

  test('every theme has a swatch colour and every font a display name', () => {
    for (const theme of themes) expect(theme.swatch).toMatch(/^#[0-9a-f]{6}$/)
    expect(fonts.map((f) => f.name)).toEqual([
      'Inter',
      'Nunito',
      'Poppins',
      'DM Sans',
      'Manrope',
      'Roboto',
      'Atkinson Hyperlegible',
      'Merriweather',
      'M PLUS Rounded 1c',
      'Zen Maru Gothic',
    ])
  })
})

describe('text size ↔ font_scale (data-model.md Profile.font_scale)', () => {
  test.each([
    ['small', 0.93],
    ['default', 1],
    ['large', 1.13],
  ] as const)('%s is %s', (size, scale) => {
    expect(toFontScale(size)).toBe(scale)
    expect(toTextSize(scale)).toBe(size)
  })

  test('reads a Prisma Decimal', async () => {
    const { Prisma } = await import('@/generated/prisma/client')
    expect(toTextSize(new Prisma.Decimal('1.13'))).toBe('large')
    expect(toTextSize(new Prisma.Decimal('0.93'))).toBe('small')
  })

  test('an unknown scale reads as default', () => {
    expect(toTextSize(1.25)).toBe('default')
  })
})

describe('the appearance cookie', () => {
  const look: Appearance = {
    colorMode: 'dark',
    themeId: 'sakura',
    fontId: 'm-plus-rounded',
    textSize: 'large',
  }

  test('round-trips', () => {
    expect(serializeAppearance(look)).toBe('dark.sakura.m-plus-rounded.large')
    expect(
      parseAppearanceCookie(`a=1; ${APPEARANCE_COOKIE}=dark.sakura.m-plus-rounded.large`),
    ).toEqual(look)
  })

  test('no cookie gives the defaults (FR-010)', () => {
    expect(defaultAppearance).toEqual({
      colorMode: 'system',
      themeId: 'indigo',
      fontId: 'inter',
      textSize: 'default',
    })
    expect(parseAppearanceCookie('')).toEqual(defaultAppearance)
    expect(parseAppearanceCookie('locale=ja')).toEqual(defaultAppearance)
  })

  test('each unknown part falls back on its own, keeping the valid ones', () => {
    expect(parseAppearanceCookie(`${APPEARANCE_COOKIE}=dark.pink.inter.default`)).toEqual({
      ...defaultAppearance,
      colorMode: 'dark',
    })
    expect(parseAppearanceCookie(`${APPEARANCE_COOKIE}=x.ocean.x.huge`)).toEqual({
      ...defaultAppearance,
      themeId: 'ocean',
    })
    expect(parseAppearanceCookie(`${APPEARANCE_COOKIE}=garbage`)).toEqual(defaultAppearance)
  })
})

describe('applyAppearance', () => {
  beforeEach(() => resetHtml())

  test('sets the theme, font and scale on <html>', () => {
    applyAppearance(document, {
      colorMode: 'dark',
      themeId: 'forest',
      fontId: 'nunito',
      textSize: 'small',
    })
    const html = document.documentElement
    expect(html.dataset.theme).toBe('forest')
    expect(html.dataset.font).toBe('nunito')
    expect(html.style.getPropertyValue('--font-scale')).toBe('0.93')
  })

  test('Indigo is the :root palette, so it removes data-theme', () => {
    document.documentElement.dataset.theme = 'rose'
    applyAppearance(document, defaultAppearance)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1')
  })
})

describe('appearanceScript (runs in <head> before first paint)', () => {
  beforeEach(() => {
    resetHtml()
    localStorage.clear()
    clearCookies()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    clearCookies()
  })

  const run = () => new Function(appearanceScript)()

  test('applies the cookie and seeds next-themes', () => {
    document.cookie = `${APPEARANCE_COOKIE}=dark.lavender.atkinson.large; path=/`
    run()
    const html = document.documentElement
    expect(html.dataset.theme).toBe('lavender')
    expect(html.dataset.font).toBe('atkinson')
    expect(html.style.getPropertyValue('--font-scale')).toBe('1.13')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  test('without a cookie it sets the defaults and leaves next-themes alone', () => {
    localStorage.setItem('theme', 'light')
    run()
    const html = document.documentElement
    expect(html.hasAttribute('data-theme')).toBe(false)
    expect(html.dataset.font).toBe('inter')
    expect(html.style.getPropertyValue('--font-scale')).toBe('1')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  test('a garbage cookie gives the defaults without throwing', () => {
    document.cookie = `${APPEARANCE_COOKIE}=<script>.;;.x; path=/`
    expect(run).not.toThrow()
    expect(document.documentElement.dataset.font).toBe('inter')
  })

  test('a throwing localStorage still sets the attributes', () => {
    document.cookie = `${APPEARANCE_COOKIE}=light.teal.roboto.small; path=/`
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(run).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('teal')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('0.93')
  })
})

function resetHtml() {
  const html = document.documentElement
  html.removeAttribute('data-theme')
  html.removeAttribute('data-font')
  html.removeAttribute('style')
}

function clearCookies() {
  document.cookie = `${APPEARANCE_COOKIE}=; path=/; max-age=0`
}
