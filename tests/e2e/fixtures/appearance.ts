import type { Page } from '@playwright/test'
import { sql } from './db'

// Spec 007 fixtures: set a profile's look behind the browser's back, and read what <html> shows
// (data-model.md Profile.color_mode, Profile.theme_id, Profile.font_id, Profile.font_scale, ›
// Device state).

export type Look = {
  colorMode?: 'light' | 'dark' | 'system'
  themeId?: string
  fontId?: string
  fontScale?: 0.93 | 1 | 1.13
}

/** Writes the look on the profile, as another device's save would. Fields left out keep their value. */
export async function setAppearance(userId: string, look: Look) {
  await sql(
    `update profiles set
       color_mode = coalesce($2, color_mode),
       theme_id = coalesce($3, theme_id),
       font_id = coalesce($4, font_id),
       font_scale = coalesce($5::numeric, font_scale)
     where id = $1`,
    [
      userId,
      look.colorMode ?? null,
      look.themeId ?? null,
      look.fontId ?? null,
      look.fontScale ?? null,
    ],
  )
}

export async function profileLook(userId: string) {
  const [row] = await sql<{
    color_mode: string
    theme_id: string
    font_id: string
    font_scale: string
  }>(`select color_mode, theme_id, font_id, font_scale::text from profiles where id = $1`, [userId])
  return row
}

/** What <html> carries: theme (null = Indigo), font, text scale, and whether it is dark. */
export function htmlLook(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement
    return {
      theme: html.getAttribute('data-theme'),
      font: html.getAttribute('data-font'),
      scale: html.style.getPropertyValue('--font-scale'),
      dark: html.classList.contains('dark'),
    }
  })
}

/** A theme token as the page resolves it on <html>, e.g. `--primary` → "#be185d". */
export function token(page: Page, name: string) {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  )
}
