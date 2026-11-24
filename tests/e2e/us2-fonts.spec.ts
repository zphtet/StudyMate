import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { htmlLook, profileLook } from './fixtures/appearance'
import { assignCourse, linkStudent, seedCourse, seedShift } from './fixtures/courses'
import { seedMessage, seedRule } from './fixtures/notifications'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 007 User Story 2 – Pick a font and text size (12-Appearance.png; research R6, R7). The root
// font size is 16 px at Default, so Large is 18.08 px and Small 14.88 px.

let zin: TestUser
let may: TestUser

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
})

const rootFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
const fontFamilyOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily)

async function chooseTextSize(page: Page, size: 'Small' | 'Default' | 'Large') {
  await page
    .getByRole('radiogroup', { name: 'Text size' })
    .getByRole('radio', { name: size })
    .click()
  await expect(
    page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: size }),
  ).toBeChecked()
}

test('scenario 1: Atkinson Hyperlegible is used for all text, and the screen order is complete', async ({
  page,
}) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  const headings = page.getByRole('main').getByRole('heading', { level: 2 })
  await expect(headings).toHaveText(['Mode', 'Colour theme · Indigo', 'Font · Inter', 'Text size'])

  await page.getByRole('radio', { name: 'Atkinson Hyperlegible' }).click()
  await expect(page.getByRole('heading', { name: 'Font · Atkinson Hyperlegible' })).toBeVisible()
  expect((await htmlLook(page)).font).toBe('atkinson')
  // Each tile shows its name in its own font, once the page is idle (T039).
  await expect
    .poll(() =>
      page
        .getByRole('radio', { name: 'Merriweather' })
        .evaluate((el) => getComputedStyle(el).fontFamily),
    )
    .toMatch(/Merriweather/)
  await expectNoSeriousA11yViolations(page)
  await expect.poll(async () => (await profileLook(may.id)).font_id).toBe('atkinson')

  await page.goto('/s/today')
  expect(await fontFamilyOf(page, 'h1')).toMatch(/Atkinson/)
})

test('scenario 2: Japanese text falls back to Noto Sans JP under Merriweather', async ({
  page,
}) => {
  const { courseId } = await seedCourse({
    ownerId: zin.id,
    title: 'JLPT N4 Grammar',
    lessons: [{ title: 'Particles は vs が', status: 'published', contentMd: '私は学生です。' }],
  })
  await assignCourse(courseId, may.id, zin.id)
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Merriweather' }).click()
  await expect(page.getByRole('heading', { name: 'Font · Merriweather' })).toBeVisible()
  // A full page load cancels a save still queued; wait for it.
  await expect.poll(async () => (await profileLook(may.id)).font_id).toBe('merriweather')

  await page.goto(`/s/courses/${courseId}`)
  const family = await fontFamilyOf(page, 'main')
  expect(family).toMatch(/Merriweather/)
  expect(family).toMatch(/Noto.?Sans.?JP/)
})

test('scenario 3: Large and Small scale the root text size', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await chooseTextSize(page, 'Large')
  expect(await rootFontSize(page)).toBe('18.08px')
  expect((await htmlLook(page)).scale).toBe('1.13')
  await chooseTextSize(page, 'Small')
  expect(await rootFontSize(page)).toBe('14.88px')
  // Tap targets keep 44 px at Small (constitution V; research R7).
  const box = await page.getByRole('radio', { name: 'Small' }).boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
})

test('scenario 5: the preview grows with Large before leaving the screen', async ({ page }) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  const preview = page.getByRole('img', { name: 'Preview' })
  const before = (await preview.boundingBox())?.height ?? 0
  await chooseTextSize(page, 'Large')
  await expect.poll(async () => (await preview.boundingBox())?.height ?? 0).toBeGreaterThan(before)
})

test('scenario 4: at Large, no page of either role scrolls sideways at 390 px (SC-004)', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'SC-004 is about phone width')
  test.setTimeout(300_000)

  const { courseId, lessonIds } = await seedCourse({
    ownerId: zin.id,
    title: 'JLPT N4 Grammar',
    sections: ['Particles and the topic marker in everyday conversation'],
    lessons: [
      {
        title: 'Particles は vs が — choosing the topic or the subject',
        section: 0,
        status: 'published',
        contentMd: '私は学生です。\n\n```\nconst x = 1\n```',
      },
    ],
  })
  const lessonId = lessonIds[0]
  await assignCourse(courseId, may.id, zin.id)
  const day = new Date(Date.now() + 86_400_000)
  const shiftId = await seedShift(may.id, {
    type: 'day',
    startAt: new Date(day.setUTCHours(0, 0, 0, 0)).toISOString(),
    endAt: new Date(day.setUTCHours(9, 0, 0, 0)).toISOString(),
  })
  const ruleId = await seedRule({
    ownerId: zin.id,
    studentId: may.id,
    trigger: 'daily',
    config: { time: '20:00', days: [1, 2, 3, 4, 5] },
    message: 'Time for a short lesson',
  })
  const messageId = await seedMessage({
    adminId: zin.id,
    studentIds: [may.id],
    body: 'Keep going, the test is close',
    deliverAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  })

  const studentRoutes = [
    '/s/today',
    '/s/courses',
    `/s/courses/${courseId}`,
    `/s/lessons/${lessonId}`,
    '/s/progress',
    '/s/shifts',
    `/s/shifts/${shiftId}`,
    '/s/shifts/new',
    '/s/shifts/rotation',
    '/s/me',
    '/s/me/appearance',
    '/s/me/account',
    '/s/me/reminders',
    '/s/inbox',
  ]
  const adminRoutes = [
    '/a/students',
    `/a/students/${may.id}`,
    `/a/students/${may.id}/lessons/${lessonId}`,
    '/a/courses',
    `/a/courses/${courseId}`,
    '/a/courses/new',
    `/a/courses/${courseId}/edit`,
    `/a/courses/${courseId}/lessons/${lessonId}/edit`,
    '/a/courses/deleted',
    '/a/plan',
    '/a/alerts',
    '/a/alerts/rules/new',
    `/a/alerts/rules/${ruleId}`,
    '/a/alerts/messages/new',
    `/a/alerts/messages/${messageId}`,
    '/a/me',
    '/a/me/appearance',
    '/a/me/account',
    '/a/inbox',
    '/a/welcome',
  ]

  const overflowing: string[] = []
  async function check(p: Page, routes: string[]) {
    for (const route of routes) {
      await p.goto(route)
      await p.waitForLoadState('networkidle')
      const wide = await p.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      if (wide) overflowing.push(route)
    }
  }

  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await chooseTextSize(page, 'Large')
  await check(page, studentRoutes)

  const { viewport, isMobile, hasTouch, deviceScaleFactor, baseURL } = testInfo.project.use
  const device = { viewport, isMobile, hasTouch, deviceScaleFactor, baseURL }
  const admin = await browser.newContext(device)
  const zinPage = await admin.newPage()
  await signIn(zinPage, zin)
  await zinPage.goto('/a/me/appearance')
  await chooseTextSize(zinPage, 'Large')
  await check(zinPage, adminRoutes)
  await admin.close()

  const signedOut = await browser.newContext(device)
  const url = new URL(baseURL ?? 'http://localhost:3100')
  await signedOut.addCookies([
    { name: 'appearance', value: 'system.indigo.inter.large', domain: url.hostname, path: '/' },
  ])
  await check(await signedOut.newPage(), ['/sign-in', '/sign-up'])
  await signedOut.close()

  expect(overflowing).toEqual([])
})

test('scenario 1, on-demand fonts: Zen Maru Gothic loads when chosen and after a reload (T039)', async ({
  page,
}) => {
  await signIn(page, may)
  await page.goto('/s/me/appearance')
  await page.getByRole('radio', { name: 'Zen Maru Gothic' }).click()
  await expect(page.getByRole('heading', { name: 'Font · Zen Maru Gothic' })).toBeVisible()
  // A full page load cancels a save still queued; wait for it.
  await expect.poll(async () => (await profileLook(may.id)).font_id).toBe('zen-maru')

  const zenMaruLoaded = () =>
    page.evaluate(() =>
      [...document.fonts].some((f) => /Zen Maru/.test(f.family) && f.status === 'loaded'),
    )
  await page.goto('/s/today')
  await expect.poll(() => fontFamilyOf(page, 'h1')).toMatch(/Zen Maru/)
  await expect.poll(zenMaruLoaded).toBe(true)
  await page.reload()
  await expect.poll(() => fontFamilyOf(page, 'h1')).toMatch(/Zen Maru/)
})
