import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent } from './fixtures/courses'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 008 User Story 1 – Install on Android, iOS and desktop (research R12; contracts/ui-routes.md
// › InstallPrompt). Needs a production build: the manifest's worker only runs there.

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let zin: TestUser
let may: TestUser

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May' })
  await linkStudent(may.id, zin.id)
})

/** A new browser session on Today: the install visit count goes up by one. */
async function newVisit(page: Page) {
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/s/today')
  // Not the page heading: an open install sheet hides the rest of the page from assistive tech.
  await page.waitForLoadState('networkidle')
}

/** Chromium offers install with this event; send it until the page's listener has caught it. */
async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(event)
  })
}

const installSheet = (page: Page) => page.getByRole('dialog', { name: 'Install StudyMate' })

test('scenario 1: the manifest is installable and has the icons', async ({ page }) => {
  await page.goto('/sign-in')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ id: '/', display: 'standalone', start_url: '/' })
  expect(
    manifest.icons.map((i: { sizes: string; purpose?: string }) => i.purpose ?? i.sizes),
  ).toEqual(['192x192', '512x512', 'maskable'])
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok()).toBe(true)
  }
  // Chrome's own installability check (constitution 2.1.0 quality gate; spec SC-001).
  await page.evaluate(() => navigator.serviceWorker.ready)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  expect(installabilityErrors).toEqual([])
})

test('scenario 1: the prompt waits for the second visit, and Not now hides it for 14 days', async ({
  page,
}) => {
  await signIn(page, may)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await offerInstall(page)
  await expect(installSheet(page)).toBeHidden()

  await newVisit(page)
  await expect(async () => {
    await offerInstall(page)
    await expect(installSheet(page)).toBeVisible({ timeout: 500 })
  }).toPass()
  await expectNoSeriousA11yViolations(page)
  await installSheet(page).getByRole('button', { name: 'Not now' }).click()
  await expect(installSheet(page)).toBeHidden()

  // Still within 14 days: a third visit offers nothing.
  await newVisit(page)
  await offerInstall(page)
  await page.waitForTimeout(500)
  await expect(installSheet(page)).toBeHidden()

  // After the 14 days it comes back.
  await page.evaluate(() => localStorage.setItem('installDismissedUntil', String(Date.now() - 1)))
  await newVisit(page)
  await expect(async () => {
    await offerInstall(page)
    await expect(installSheet(page)).toBeVisible({ timeout: 500 })
  }).toPass()
})

test('scenario 2: iPhone Safari shows the Add to Home Screen steps instead', async ({
  browser,
}, testInfo) => {
  const { viewport, baseURL } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    baseURL,
    userAgent: IPHONE_SAFARI,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await signIn(page, may)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(installSheet(page)).toBeHidden()

  await newVisit(page)
  const sheet = installSheet(page)
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('listitem')).toHaveCount(3)
  await expect(sheet.getByRole('listitem').first()).toContainText('Share')
  await expect(sheet.getByRole('button', { name: 'Install' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Got it' }).click()
  await expect(sheet).toBeHidden()
  await context.close()
})

test('scenario 3: the installed app never shows the prompt', async ({ page }) => {
  // Opened from the home screen: display-mode standalone.
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) =>
      query === '(display-mode: standalone)'
        ? ({ ...matchMedia(query), matches: true, media: query } as MediaQueryList)
        : matchMedia(query)
  })
  await signIn(page, zin)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/a/students')
  await offerInstall(page)
  await page.waitForTimeout(500)
  await expect(installSheet(page)).toBeHidden()
})
