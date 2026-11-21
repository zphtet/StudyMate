// @vitest-environment node
// Constitution V / technical spec §11: every text token on its background reaches 4.5:1 (WCAG AA),
// in light and dark. 001 ships the indigo theme only; feature 007 extends this to all 10 themes.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`No "${selector} {" block in globals.css`)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  )
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
]

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('indigo theme, %s', (_, selector) => {
  const t = tokens(selector)
  test.each(pairs)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(t[fg], `--${fg} missing`).toBeDefined()
    expect(t[bg], `--${bg} missing`).toBeDefined()
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
})
