import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse } from './fixtures/courses'
import { waitForWorker } from './fixtures/offline'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 008 User Story 3 – Updates (research R13; contracts/ui-routes.md › UpdateToast). A deploy
// gives the browser a worker it hasn't seen, which waits; the test registers one on the same scope.
// Needs a production build.

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
}) => {
  await signIn(page, may)
  await waitForWorker(page)
  await page.goto(`/s/lessons/${lessonId}?tab=assignment`)
  const answer = page.getByRole('textbox', { name: 'Your answer' })
  await answer.fill('半分だけ書いた')
  await page.evaluate(() => {
    ;(window as Window & { beforeUpdate?: boolean }).beforeUpdate = true
  })

  // The next deploy: a worker the browser hasn't seen installs and waits. (Playwright can't route
  // the browser's own fetch of the worker script, so a new script URL on the same scope stands in
  // for new bytes; the browser treats both as an update.)
  await page.evaluate(() =>
    navigator.serviceWorker.register('/serwist/sw.js?next', { scope: '/', type: 'module' }),
  )

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

  await Promise.all([
    page.waitForEvent('load'),
    toast.getByRole('button', { name: 'Reload' }).click(),
  ])
  expect(
    await page.evaluate(() => (window as Window & { beforeUpdate?: boolean }).beforeUpdate),
  ).toBeUndefined()
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting),
  ).toBeNull()
})
