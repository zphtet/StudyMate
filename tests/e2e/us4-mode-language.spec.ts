import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { htmlLook } from './fixtures/appearance'
import { linkStudent } from './fixtures/courses'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 007 User Story 4 – Mode and Language, built in 001, keep working inside the new Appearance
// screen (regression checks; 001 had no end-to-end test for either).

let zin: TestUser
let may: TestUser

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
})

test('scenario 1: Light and Dark switch at once; Auto follows the device live', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  const mode = page.getByRole('radiogroup', { name: 'Mode' })

  await mode.getByRole('radio', { name: 'Dark' }).click()
  await expect.poll(async () => (await htmlLook(page)).dark).toBe(true)
  await mode.getByRole('radio', { name: 'Light' }).click()
  await expect.poll(async () => (await htmlLook(page)).dark).toBe(false)

  await mode.getByRole('radio', { name: 'Auto' }).click()
  await expect(mode.getByRole('radio', { name: 'Auto' })).toBeChecked()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(async () => (await htmlLook(page)).dark).toBe(true)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(async () => (await htmlLook(page)).dark).toBe(false)
})

test('scenario 2: the language buttons translate Appearance, Me and Today; font names stay', async ({
  page,
}) => {
  await signIn(page, may)
  await page.goto('/s/me')
  await page.getByRole('radio', { name: '日本語' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.getByRole('link', { name: /外観/ })).toContainText('インディゴ · Inter · 自動')

  await page.goto('/s/me/appearance')
  const headings = page.getByRole('main').getByRole('heading', { level: 2 })
  await expect(headings).toHaveText([
    'モード',
    'カラーテーマ · インディゴ',
    'フォント · Inter',
    '文字サイズ',
  ])
  await expect(page.getByRole('radio', { name: 'Atkinson Hyperlegible' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.goto('/s/today')
  await expect(page.getByRole('main')).toContainText('月')

  await page.goto('/s/me')
  await page.getByRole('radio', { name: 'မြန်မာ' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'my')
  await page.goto('/s/me/appearance')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('အသွင်အပြင်')
})
