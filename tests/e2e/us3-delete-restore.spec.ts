import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, markDone, seedCourse, seedSubmission } from './fixtures/courses'
import { sql } from './fixtures/db'
import { hideNextDevOverlay } from './fixtures/dev-overlay'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 002 User Story 3 – Admin edits, archives and deletes safely (screen 21-AdminDelete, plus the
// delete course dialog and Recently deleted from contracts/ui-routes.md). Assignments (003) and
// student work (004) are seeded directly.

let admin: TestUser
let student: TestUser

test.beforeEach(async ({ page }) => {
  await hideNextDevOverlay(page)
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  student = await createConfirmedUser({ role: 'student', displayName: 'May' })
  await linkStudent(student.id, admin.id)
})

/** Lesson titles in course order on the admin course page. */
const lessonTitles = (page: Page) =>
  page.getByTestId('lesson-title').evaluateAll((els) => els.map((el) => el.textContent))

async function seedGrammar() {
  const course = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    lessons: [
      { title: 'Particle を for objects' },
      { title: 'Particles は vs が' },
      { title: 'Particle で for means' },
    ],
  })
  await assignCourse(course.courseId, student.id, admin.id)
  return course
}

test('3.1: the delete sheet lists student work; Unpublish instead, then delete', async ({
  page,
}) => {
  const { courseId, lessonIds } = await seedGrammar()
  await seedSubmission(student.id, lessonIds[1], 'draft')
  await signIn(page, admin)

  await page.goto(`/a/courses/${courseId}/lessons/${lessonIds[1]}/edit`)
  await page.getByRole('button', { name: 'Delete lesson' }).click()
  const sheet = page.getByRole('dialog', { name: 'Delete “Particles は vs が”?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Lesson 2 in JLPT N4 Grammar.')).toBeVisible()
  await expect(sheet.getByRole('listitem').filter({ hasText: 'May' })).toContainText(
    'Draft assignment',
  )
  await expect(
    sheet.getByText('Deleting a whole course asks you to type its name first.'),
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await sheet.getByRole('button', { name: 'Unpublish instead' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
  const [{ status }] = await sql<{ status: string }>(`select status from lessons where id = $1`, [
    lessonIds[1],
  ])
  expect(status).toBe('draft')

  // A Draft lesson offers no "Unpublish instead".
  await page.getByRole('button', { name: 'Delete lesson' }).click()
  await expect(sheet.getByRole('button', { name: 'Unpublish instead' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Delete lesson' }).click()

  await expect(page).toHaveURL(new RegExp(`/a/courses/${courseId}$`))
  await expect
    .poll(() => lessonTitles(page))
    .toEqual(['Particle を for objects', 'Particle で for means'])
})

test('3.3: Recently deleted lists the lesson, and Restore puts it back in place', async ({
  page,
}) => {
  const { courseId, lessonIds } = await seedGrammar()
  await sql(`update lessons set deleted_at = now() where id = $1`, [lessonIds[1]])
  await sql(`update lessons set position = 1 where id = $1`, [lessonIds[2]])
  await signIn(page, admin)

  await page.goto('/a/courses')
  await page.getByRole('link', { name: 'Recently deleted' }).click()
  await expect(page).toHaveURL(/\/a\/courses\/deleted$/)
  const row = page.getByRole('listitem').filter({ hasText: 'Particles は vs が' })
  await expect(row).toContainText('in JLPT N4 Grammar')
  await expect(row).toContainText(/removed for good on/)
  await expectNoSeriousA11yViolations(page)

  await row.getByRole('button', { name: 'Restore Particles は vs が' }).click()
  await expect(row).toBeHidden()
  await page.goto(`/a/courses/${courseId}`)
  await expect
    .poll(() => lessonTitles(page))
    .toEqual(['Particle を for objects', 'Particles は vs が', 'Particle で for means'])
})

test('3.2: Delete course needs the exact name; restoring keeps student progress', async ({
  page,
}) => {
  const { courseId, lessonIds } = await seedGrammar()
  await markDone(student.id, lessonIds[0])
  await signIn(page, admin)

  await page.goto('/a/courses')
  await page.getByRole('button', { name: 'Course actions: JLPT N4 Grammar' }).click()
  await page.getByRole('menuitem', { name: 'Delete course' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete JLPT N4 Grammar?' })
  const confirm = dialog.getByRole('button', { name: 'Delete course' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Type the course name to confirm').fill('JLPT N4')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Type the course name to confirm').fill('JLPT N4 Grammar')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByRole('link', { name: 'JLPT N4 Grammar' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Recently deleted' }).click()
  await page.getByRole('button', { name: 'Restore JLPT N4 Grammar' }).click()
  await expect(page.getByRole('button', { name: 'Restore JLPT N4 Grammar' })).toBeHidden()

  await page.goto('/a/courses')
  await expect(page.getByRole('link', { name: 'JLPT N4 Grammar' })).toBeVisible()
  const progress = await sql<{ status: string }>(
    `select status from lesson_progress where student_id = $1 and lesson_id = $2`,
    [student.id, lessonIds[0]],
  )
  expect(progress).toEqual([{ status: 'done' }])
  const [{ deleted_at }] = await sql<{ deleted_at: Date | null }>(
    `select deleted_at from courses where id = $1`,
    [courseId],
  )
  expect(deleted_at).toBeNull()
})

test('3.4: an archived course keeps only completed lessons for the student', async ({
  page,
  browser,
}) => {
  const { courseId, lessonIds } = await seedGrammar()
  await markDone(student.id, lessonIds[0])
  await signIn(page, admin)

  await page.goto('/a/courses')
  await page.getByRole('button', { name: 'Course actions: JLPT N4 Grammar' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await page.getByRole('button', { name: 'Archived · 1' }).click()
  await expect(page.getByRole('link', { name: 'JLPT N4 Grammar' })).toBeVisible()

  const studentPage = await (await browser.newContext()).newPage()
  await signIn(studentPage, student)
  await studentPage.goto('/s/courses')
  await studentPage.getByRole('button', { name: 'Archived · 1' }).click()
  await studentPage.getByRole('link', { name: /JLPT N4 Grammar/ }).click()
  await expect(studentPage).toHaveURL(new RegExp(`/s/courses/${courseId}$`))
  await expect(studentPage.getByTestId('student-lesson-title')).toHaveText([
    'Particle を for objects',
  ])
  await studentPage.goto(`/s/lessons/${lessonIds[1]}`)
  await expect(studentPage.getByText('This page could not be found.')).toBeVisible()

  // Unarchive from the course page brings it back to Active.
  await page.goto(`/a/courses/${courseId}`)
  await page.getByRole('button', { name: 'Unarchive' }).click()
  await expect(
    page.getByText('Archived. Students keep only the lessons they completed.'),
  ).toBeHidden()
})

test('the purge job refuses calls without the cron secret', async ({ request }) => {
  expect((await request.get('/api/cron/purge')).status()).toBe(401)
  const wrong = await request.get('/api/cron/purge', {
    headers: { authorization: 'Bearer not-the-secret' },
  })
  expect(wrong.status()).toBe(401)
})
