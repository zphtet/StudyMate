import { expect, test, type Page } from '@playwright/test'
import { htmlLook, profileLook, setAppearance } from './fixtures/appearance'
import { linkStudent } from './fixtures/courses'
import { createConfirmedUser, signIn, signedInPage, type TestUser } from './fixtures/users'

// Spec 007 User Story 3 – the right look from the first frame (research R1–R3, R10; SC-003). An
// init script records every real change to <html>'s class, data-theme, data-font and style, with
// its time; a change after first contentful paint is a visible switch.

let zin: TestUser
let may: TestUser

test.beforeEach(async ({ page }) => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
  await page.addInitScript(recordHtmlChanges)
})

function recordHtmlChanges() {
  const changes: { name: string; value: string | null; at: number }[] = []
  ;(window as unknown as { __htmlChanges: typeof changes }).__htmlChanges = changes
  // Init scripts run before <html> exists, so watch the document's subtree, not the element.
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target !== document.documentElement) continue
      const name = record.attributeName ?? ''
      const value = document.documentElement.getAttribute(name)
      if (value !== record.oldValue) changes.push({ name, value, at: performance.now() })
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'data-theme', 'data-font', 'style'],
  })
}

/** Every recorded change to <html>'s look during this page load, and whether it came after FCP. */
async function htmlChanges(page: Page) {
  await page.waitForLoadState('networkidle')
  return page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Infinity
    const changes = (
      window as unknown as { __htmlChanges: { name: string; value: string | null; at: number }[] }
    ).__htmlChanges
    return changes.map((c) => ({ name: c.name, value: c.value, visible: c.at > fcp }))
  })
}

/** Changes to the look of <html> after first contentful paint, i.e. ones the user could see. */
async function visibleSwitches(page: Page) {
  return (await htmlChanges(page)).filter((c) => c.visible).map((c) => c.name)
}

/**
 * Dark + Forest + Nunito + Large, through the screen. Each choice shows at once, but the saves run
 * one after another; wait for the last one before navigating, since a full page load cancels any
 * still queued.
 */
async function chooseLook(page: Page) {
  await page.goto('/s/me/appearance')
  for (const name of ['Dark', 'Forest', 'Nunito', 'Large']) {
    await page.getByRole('radio', { name, exact: true }).click()
    await expect(page.getByRole('radio', { name, exact: true })).toBeChecked()
  }
  await expect
    .poll(() => profileLook(may.id))
    .toEqual({ color_mode: 'dark', theme_id: 'forest', font_id: 'nunito', font_scale: '1.13' })
}

const darkForestNunitoLarge = { theme: 'forest', font: 'nunito', scale: '1.13', dark: true }

test('scenario 1: a returning user sees their look from the first frame', async ({ page }) => {
  await signIn(page, may)
  await chooseLook(page)

  for (const route of ['/s/today', '/s/courses']) {
    await page.goto(route)
    expect(await visibleSwitches(page)).toEqual([])
    expect(await htmlLook(page)).toEqual(darkForestNunitoLarge)
  }
})

test('scenario 2: after signing out, sign-in keeps the device look', async ({ page }) => {
  await signIn(page, may)
  await chooseLook(page)
  await page.goto('/s/me')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  await page.reload()
  expect(await visibleSwitches(page)).toEqual([])
  expect(await htmlLook(page)).toEqual(darkForestNunitoLarge)
})

test('scenario 3: a new device shows the account look on the first screen after sign-in', async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, may)
  await chooseLook(page)

  const other = await signedInPage(browser, testInfo, may)
  expect(await htmlLook(other)).toEqual(darkForestNunitoLarge)
  await other.context().close()
})

test('scenario 5: a change made on another device switches once, then sticks', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/today')
  await page.waitForLoadState('networkidle')

  await setAppearance(may.id, { themeId: 'ocean' })
  await page.reload()
  await expect.poll(async () => (await htmlLook(page)).theme).toBe('ocean')
  // One switch on this open (clarification Q4). It may land before or after first paint, so the
  // check is that it happens exactly once, not when.
  const themeChanges = (await htmlChanges(page)).filter((c) => c.name === 'data-theme')
  expect(themeChanges.map((c) => c.value)).toEqual(['ocean'])

  await page.reload()
  expect(await visibleSwitches(page)).toEqual([])
  expect((await htmlLook(page)).theme).toBe('ocean')
})

test('FR-015: with Dark chosen in a light-scheme browser, the browser bar is dark', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Dark', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
          m.getAttribute('content'),
        ),
      ),
    )
    .toEqual(['#0c0a09', '#0c0a09'])
})
