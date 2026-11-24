// Appearance (spec 007): the theme, font and text-size lists, the `appearance` cookie that keeps a
// device's look, and the pre-paint script that applies it (research R1, R2, R7). One source for the
// root layout, the profile feature, sign-in and AppearanceSync. Pure and client-safe.
// data-model.md › Profile.color_mode, Profile.theme_id, Profile.font_id, Profile.font_scale.

export const colorModes = ['light', 'dark', 'system'] as const
export type ColorMode = (typeof colorModes)[number]

export const themeIds = [
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
] as const
export type ThemeId = (typeof themeIds)[number]

/** The theme's light --primary (research R4), for the swatches on Appearance and the Me row. */
const swatches: Record<ThemeId, string> = {
  indigo: '#4338ca',
  ocean: '#0369a1',
  teal: '#0f766e',
  forest: '#15803d',
  sunset: '#c2410c',
  rose: '#be123c',
  sakura: '#be185d',
  lavender: '#6d28d9',
  slate: '#334155',
  mocha: '#92400e',
}
export const themes = themeIds.map((id) => ({ id, swatch: swatches[id] }))
export const themeSwatch = (id: ThemeId) => swatches[id]

export const fontIds = [
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
] as const
export type FontId = (typeof fontIds)[number]

/** Shown as their designers write them, never translated (spec FR-013). */
const fontNames: Record<FontId, string> = {
  inter: 'Inter',
  nunito: 'Nunito',
  poppins: 'Poppins',
  'dm-sans': 'DM Sans',
  manrope: 'Manrope',
  roboto: 'Roboto',
  atkinson: 'Atkinson Hyperlegible',
  merriweather: 'Merriweather',
  'm-plus-rounded': 'M PLUS Rounded 1c',
  'zen-maru': 'Zen Maru Gothic',
}
export const fonts = fontIds.map((id) => ({ id, name: fontNames[id] }))
export const fontName = (id: FontId) => fontNames[id]

/** Small / Default / Large ↔ profiles.font_scale (research R7: the draft's 14 / 15 / 17 px steps). */
export const textSizes = ['small', 'default', 'large'] as const
export type TextSize = (typeof textSizes)[number]
const scales: Record<TextSize, number> = { small: 0.93, default: 1, large: 1.13 }

export type Appearance = {
  colorMode: ColorMode
  themeId: ThemeId
  fontId: FontId
  textSize: TextSize
}

/** FR-010: Auto, Indigo, Inter, Default. */
export const defaultAppearance: Appearance = {
  colorMode: 'system',
  themeId: 'indigo',
  fontId: 'inter',
  textSize: 'default',
}

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

export const toFontScale = (size: TextSize) => scales[size]

/** A stored scale (number or Prisma Decimal) as a size; anything else reads as Default. */
export function toTextSize(scale: number | { toString(): string }): TextSize {
  const value = Number(scale.toString())
  return textSizes.find((size) => Math.abs(scales[size] - value) < 0.001) ?? 'default'
}

/** Narrows stored profile values; an unknown value becomes its default. */
export function toAppearance(row: {
  colorMode: string
  themeId: string
  fontId: string
  fontScale: number | { toString(): string }
}): Appearance {
  return {
    colorMode: isOneOf(colorModes, row.colorMode) ? row.colorMode : defaultAppearance.colorMode,
    themeId: isOneOf(themeIds, row.themeId) ? row.themeId : defaultAppearance.themeId,
    fontId: isOneOf(fontIds, row.fontId) ? row.fontId : defaultAppearance.fontId,
    textSize: toTextSize(row.fontScale),
  }
}

/**
 * The page background per mode (globals.css --background), for the browser and status bar: it
 * follows Light or Dark, never the colour theme (FR-015, research R10).
 */
export const barColor = { light: '#fafaf9', dark: '#0c0a09' } as const

// ── The device's copy: the `appearance` cookie (data-model.md › Device state) ────────────────

export const APPEARANCE_COOKIE = 'appearance'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // a year, like the locale and tz cookies

/** `<mode>.<theme>.<font>.<size>`, e.g. `dark.sakura.nunito.large`. Ids never contain a dot. */
export const serializeAppearance = (look: Appearance) =>
  `${look.colorMode}.${look.themeId}.${look.fontId}.${look.textSize}`

/** Reads the cookie from a `Cookie` header or `document.cookie`, part by part. */
export function parseAppearanceCookie(cookies: string): Appearance {
  const match = new RegExp(`(?:^|;\\s*)${APPEARANCE_COOKIE}=([^;]*)`).exec(cookies)
  const [mode, theme, font, size] = match ? match[1].split('.') : []
  return {
    colorMode: isOneOf(colorModes, mode) ? mode : defaultAppearance.colorMode,
    themeId: isOneOf(themeIds, theme) ? theme : defaultAppearance.themeId,
    fontId: isOneOf(fontIds, font) ? font : defaultAppearance.fontId,
    textSize: isOneOf(textSizes, size) ? size : defaultAppearance.textSize,
  }
}

/** For writing the cookie in the browser (AppearanceSync); the server uses next/headers. */
export const appearanceCookieString = (look: Appearance) =>
  `${APPEARANCE_COOKIE}=${serializeAppearance(look)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`

/**
 * Theme, font and size on <html> (mode is next-themes' class). Indigo is the :root palette, so it
 * has no data-theme (research R4).
 */
export function applyAppearance(doc: Document, look: Appearance) {
  const html = doc.documentElement
  if (look.themeId === 'indigo') html.removeAttribute('data-theme')
  else html.setAttribute('data-theme', look.themeId)
  html.setAttribute('data-font', look.fontId)
  html.style.setProperty('--font-scale', String(toFontScale(look.textSize)))
}

/**
 * Runs in <head> before the body is parsed (research R1): applies the cookie's look, and copies its
 * mode into next-themes' `localStorage.theme` so next-themes' own script (later, in <body>) uses it
 * (R2). Without a cookie it sets the defaults and leaves next-themes alone. Built from the lists
 * above so the script and the app can't disagree; never throws.
 */
export const appearanceScript = `(function(){try{var h=document.documentElement,m=document.cookie.match(/(?:^|;\\s*)${APPEARANCE_COOKIE}=([^;]*)/),p=m?m[1].split('.'):[],M=${JSON.stringify(colorModes)},T=${JSON.stringify(themeIds)},F=${JSON.stringify(fontIds)},S=${JSON.stringify(scales)},t=T.indexOf(p[1])>-1?p[1]:'indigo';if(t==='indigo')h.removeAttribute('data-theme');else h.setAttribute('data-theme',t);h.setAttribute('data-font',F.indexOf(p[2])>-1?p[2]:'inter');h.style.setProperty('--font-scale',String(Object.prototype.hasOwnProperty.call(S,p[3])?S[p[3]]:1));if(m)try{localStorage.setItem('theme',M.indexOf(p[0])>-1?p[0]:'system')}catch(e){}}catch(e){}})()`
