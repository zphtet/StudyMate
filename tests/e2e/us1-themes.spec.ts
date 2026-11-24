import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { htmlLook, profileLook, token } from './fixtures/appearance'
import { linkStudent } from './fixtures/courses'
import { createConfirmedUser, signIn, signedInPage, type TestUser } from './fixtures/users'

// Spec 007 User Story 1 – Pick a colour theme (12-Appearance.png, 11-Profile.png; contracts/
// ui-routes.md). Colours come from research R4: Sakura light #be185d, dark #f472b6.

let zin: TestUser
let may: TestUser

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
})

test('scenario 1: Appearance shows the preview, then Mode, then Colour theme · Indigo', async ({
  page,
}) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  const main = page.getByRole('main')
  await expect(main.getByRole('img', { name: 'Preview' })).toContainText('May')
  const headings = main.getByRole('heading', { level: 2 })
  await expect(headings.nth(0)).toHaveText('Mode')
  await expect(headings.nth(1)).toHaveText('Colour theme · Indigo')
  await expect(main.getByRole('radio', { name: 'Indigo' })).toBeChecked()
  await expectNoSeriousA11yViolations(page)
})

test('scenario 2: tapping Sakura turns the app Sakura at once and saves it', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Sakura' }).click()

  await expect(page.getByRole('radio', { name: 'Sakura' })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Colour theme · Sakura' })).toBeVisible()
  expect((await htmlLook(page)).theme).toBe('sakura')
  expect(await token(page, '--primary')).toBe('#be185d')
  await expect.poll(async () => (await profileLook(may.id)).theme_id).toBe('sakura')

  // The tab bar and the rest of the app follow (FR-003).
  await page.goto('/s/today')
  expect((await htmlLook(page)).theme).toBe('sakura')
  const activeTab = page.locator('a[aria-current="page"]').filter({ hasText: 'Today' }).first()
  await expect(activeTab).toHaveCSS('color', 'rgb(190, 24, 93)')
})

test('scenario 4: Dark keeps Sakura, in its dark palette', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Sakura' }).click()
  await page.getByRole('radio', { name: 'Dark' }).click()

  await expect.poll(async () => (await htmlLook(page)).dark).toBe(true)
  expect((await htmlLook(page)).theme).toBe('sakura')
  expect(await token(page, '--primary')).toBe('#f472b6')
  await expectNoSeriousA11yViolations(page)
})

test('scenario 5: status colours stay the same in every theme (FR-004)', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  const indigo = await Promise.all(
    ['--destructive', '--success', '--warning'].map((n) => token(page, n)),
  )
  await page.getByRole('radio', { name: 'Rose' }).click()
  await expect.poll(async () => (await htmlLook(page)).theme).toBe('rose')
  const rose = await Promise.all(
    ['--destructive', '--success', '--warning'].map((n) => token(page, n)),
  )
  expect(rose).toEqual(indigo)
})

test('scenario 6, new device: signing in elsewhere opens in Sakura from the first screen', async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Sakura' }).click()
  await expect.poll(async () => (await profileLook(may.id)).theme_id).toBe('sakura')

  const other = await signedInPage(browser, testInfo, may)
  expect((await htmlLook(other)).theme).toBe('sakura')
  await other.context().close()
})

test('scenario 7: Me shows the swatch and "Sakura · Inter · Auto"', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Sakura' }).click()
  await expect.poll(async () => (await profileLook(may.id)).theme_id).toBe('sakura')
  await page.goto('/s/me')
  await expect(page.getByRole('link', { name: /Appearance/ })).toContainText(
    'Sakura · Inter · Auto',
  )
  await expectNoSeriousA11yViolations(page)
})

test('FR-014: when saving fails, the previous theme comes back with an error', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  // Server Actions POST to the page itself; fail them as a dropped connection would.
  await page.route('**/s/me/appearance', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  )
  await page.getByRole('radio', { name: 'Ocean' }).click()

  await expect(page.locator('[data-sonner-toast]')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Indigo' })).toBeChecked()
  expect((await htmlLook(page)).theme).toBeNull()
  expect((await profileLook(may.id)).theme_id).toBe('indigo')
})

test('the Admin has the same screen: Zin picks Ocean', async ({ page }) => {
  await signIn(page, zin)
  await page.goto('/a/me/appearance')
  await page.getByRole('radio', { name: 'Ocean' }).click()
  await expect.poll(async () => (await profileLook(zin.id)).theme_id).toBe('ocean')
  expect((await htmlLook(page)).theme).toBe('ocean')
  await page.goto('/a/students')
  expect(await token(page, '--primary')).toBe('#0369a1')
})
