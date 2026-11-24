// @vitest-environment node
// Constitution V / technical spec §11: every text token on its background reaches 4.5:1 (WCAG AA),
// in light and dark, for all 10 themes (spec 007 FR-005, SC-002; research R4, R13). A theme block
// overrides only the six accent tokens; everything else comes from :root / .dark, as in the cascade.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { fontIds, themeIds } from '@/lib/appearance'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')

/** The hex tokens of the block whose selector starts a line, or null when there's no such block. */
function block(selector: string): Record<string, string> | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, `['"]`)
  const match = new RegExp(`(^|\\n)${escaped} \\{`).exec(css)
  if (!match) return null
  const start = match.index
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  )
}

function tokens(selector: string): Record<string, string> {
  const found = block(selector)
  if (!found) throw new Error(`No "${selector} {" block in globals.css`)
  return found
}

/** Spec 007 research R4: the only tokens a theme block may set. */
const accentTokens = [
  'primary',
  'primary-foreground',
  'accent',
  'accent-foreground',
  'ring',
  'chart-1',
].sort()

/** Tokens of a theme in a mode, merged the way the cascade merges them on <html>. */
function themeTokens(theme: string, mode: 'light' | 'dark'): Record<string, string> {
  const root = tokens(':root')
  const base = mode === 'light' ? root : { ...root, ...tokens('.dark') }
  if (theme === 'indigo') return base
  const selector = mode === 'light' ? `[data-theme='${theme}']` : `.dark[data-theme='${theme}']`
  return { ...base, ...tokens(selector) }
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [text token, background token]
const pairs: [string, string][] = [
  ['foreground', 'background'],
  ['muted-foreground', 'background'],
  ['primary', 'background'],
  ['destructive', 'background'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'card'],
  ['primary', 'card'],
  ['destructive', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['accent-foreground', 'accent'],
  ['primary', 'accent'],
  ['inverse-foreground', 'inverse'],
  ['inverse-muted', 'inverse'],
  ['warning-foreground', 'warning'],
  ['success', 'card'],
  ['tint-1-foreground', 'tint-1'],
  ['tint-2-foreground', 'tint-2'],
  ['tint-3-foreground', 'tint-3'],
  ['tint-4-foreground', 'tint-4'],
  // Status chips (spec 002): Published / Active. Spec 003 deadline chips: Done, late, due soon.
  ['success', 'success-soft'],
  ['destructive', 'destructive-soft'],
  ['warning-foreground', 'warning'],
  // Course colours (spec 002 data-model.md Course.color): icon glyph on its tile.
  ['course-indigo', 'course-indigo-soft'],
  ['course-teal', 'course-teal-soft'],
  ['course-rust', 'course-rust-soft'],
  ['course-berry', 'course-berry-soft'],
  ['course-green', 'course-green-soft'],
  ['course-slate', 'course-slate-soft'],
  // Shift types (spec 005 research R5): chip and tile text on its colour.
  ['shift-day-foreground', 'shift-day'],
  ['shift-evening-foreground', 'shift-evening'],
  ['shift-night-foreground', 'shift-night'],
  ['shift-custom-foreground', 'shift-custom'],
]

/** Spec 004 heat shades: `color-mix(in srgb, var(--a) N%, var(--b))` (or `var(--a)`) from :root. */
function heatTokens(t: Record<string, string>) {
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const hex = (channels: number[]) =>
    `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const heat: Record<string, string> = {}
  for (const [, name, a, percent, b] of root.matchAll(
    /--(heat-\d):\s*color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, var\(--([\w-]+)\)\)/g,
  )) {
    const p = Number(percent) / 100
    const [x, y] = [rgb(t[a]), rgb(t[b])]
    heat[name] = hex(x.map((c, i) => c * p + y[i] * (1 - p)))
  }
  for (const [, name, a] of root.matchAll(/--(heat-\d):\s*var\(--([\w-]+)\);/g)) heat[name] = t[a]
  return heat
}

const heatPairs: [string, string][] = [
  ['foreground', 'heat-1'],
  ['foreground', 'heat-2'],
  ['foreground', 'heat-3'],
  ['primary-foreground', 'heat-4'],
]

const combinations = themeIds.flatMap((theme) =>
  (['light', 'dark'] as const).map((mode) => [theme, mode] as const),
)

describe.each(combinations)('%s theme, %s', (theme, mode) => {
  // Looked up inside each test, so a missing theme block fails its own tests, not the whole file.
  test.each(heatPairs)('%s on %s (Progress calendar day) ≥ 4.5:1', (fg, bg) => {
    const t = themeTokens(theme, mode)
    const heat = heatTokens(t)
    expect(heat[bg], `--${bg} missing`).toBeDefined()
    expect(contrast(t[fg], heat[bg])).toBeGreaterThanOrEqual(4.5)
  })

  test.each(pairs)('%s on %s ≥ 4.5:1', (fg, bg) => {
    const t = themeTokens(theme, mode)
    expect(t[fg], `--${fg} missing`).toBeDefined()
    expect(t[bg], `--${bg} missing`).toBeDefined()
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
})

describe.each(themeIds.filter((id) => id !== 'indigo'))('%s theme blocks', (theme) => {
  test.each([
    ['light', `[data-theme='${theme}']`],
    ['dark', `.dark[data-theme='${theme}']`],
  ])('the %s block sets exactly the six accent tokens', (_, selector) => {
    const found = block(selector)
    expect(found, `no "${selector} {" block`).not.toBeNull()
    expect(Object.keys(found ?? {}).sort()).toEqual(accentTokens)
  })
})

test.each([...fontIds])('font %s has a [data-font] line', (font) => {
  const line = new RegExp(
    `\\[data-font=['"]${font}['"]\\]\\s*\\{\\s*--font-active:\\s*var\\(--font-${font}\\);?\\s*\\}`,
  )
  expect(css).toMatch(line)
})
