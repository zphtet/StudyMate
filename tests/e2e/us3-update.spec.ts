import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse } from './fixtures/courses'
import { waitForWorker } from './fixtures/offline'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 008 User Story 3 – Updates (research R13; contracts/ui-routes.md › UpdateToast). A deploy
// changes the worker's bytes; here the test serves the same worker with one more line, which the
// browser's update check treats the same way. Needs a production build.

let zin: TestUser
let may: TestUser
let lessonId: string

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May' })
  await linkStudent(may.id, zin.id)
  const { courseId, lessonIds } = await seedCourse({
    ownerId: zin.id,
    unlockInOrder: false,
    lessons: [{ title: 'Verbs', assignmentPrompt: 'Write 5 sentences.' }],
  })
  lessonId = lessonIds[0]
  await assignCourse(courseId, may.id, zin.id)
})

test('scenario 1: a new version shows "Update ready"; nothing reloads mid-edit; Reload updates', async ({
  page,
  context,
}) => {
  await signIn(page, may)
  await waitForWorker(page)
  await page.goto(`/s/lessons/${lessonId}?tab=assignment`)
  const answer = page.getByRole('textbox', { name: 'Your answer' })
  await answer.fill('半分だけ書いた')
  await page.evaluate(() => {
    ;(window as Window & { beforeUpdate?: boolean }).beforeUpdate = true
  })

  // The next deploy.
  await context.route('**/serwist/sw.js', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\n// next version\n` })
  })
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())

  const toast = page.getByRole('status').or(page.locator('[data-sonner-toast]')).filter({
    hasText: 'Update ready',
  })
  await expect(toast).toBeVisible({ timeout: 30_000 })
  await expectNoSeriousA11yViolations(page)
  // Nothing reloaded: the page is the same one and the half-written answer is still there.
  await page.waitForTimeout(2_000)
  expect(
    await page.evaluate(() => (window as Window & { beforeUpdate?: boolean }).beforeUpdate),
  ).toBe(true)
  await expect(answer).toHaveValue('半分だけ書いた')

  await toast.getByRole('button', { name: 'Reload' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as Window & { beforeUpdate?: boolean }).beforeUpdate))
    .toBeUndefined()
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting),
  ).toBeNull()
})
