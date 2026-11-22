import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signedInPage, signIn, type TestUser } from './fixtures/users'

// Spec 004 User Story 1 – Mark a lesson complete (screen 10-Lesson, 05-Courses, 09-Course partial;
// contracts/ui-routes.md). Linking (001) and assignments (003) are seeded directly.

let admin: TestUser
let student: TestUser

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  student = await createConfirmedUser({
    role: 'student',
    displayName: 'May',
    timezone: 'Asia/Tokyo',
  })
  await linkStudent(student.id, admin.id)
  await signIn(page, student)
})

/** Three in-order lessons; the second is "submit before complete" with a prompt. */
async function grammarCourse() {
  const course = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    color: 'teal',
    lessons: [
      { title: 'Particles は vs が', estMinutes: 15 },
      {
        title: 'Verbs',
        estMinutes: 20,
        assignmentPrompt: 'Write 5 sentences.',
        requireSubmission: true,
      },
      { title: 'Adjectives', estMinutes: 10 },
    ],
  })
  await assignCourse(course.courseId, student.id, admin.id)
  return course
}

const bottomBar = (page: Page) => page.getByRole('region', { name: 'Lesson actions' })

/** Clicks a button whose Server Action updates the screen optimistically, and waits until it saved. */
async function clickAndSave(page: Page, button: Locator) {
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.ok())
  await button.click()
  await saved
}

test('scenario 1: Mark complete shows Done at once, unlocks the next lesson and updates progress', async ({
  page,
}) => {
  const { courseId, lessonIds } = await grammarCourse()

  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await expect(page.getByRole('heading', { name: 'Particles は vs が', level: 1 })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Lesson', selected: true })).toBeVisible()

  // Optimistic: the bar changes while the Server Action is still held back (SC-001).
  let releaseAction: () => void = () => {}
  const actionHeld = new Promise<void>((resolve) => (releaseAction = resolve))
  const lessonUrl = `**/s/lessons/${lessonIds[0]}*`
  await page.route(lessonUrl, async (route) => {
    if (route.request().method() === 'POST') await actionHeld
    await route.continue()
  })
  const actionAnswered = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes(lessonIds[0]),
  )
  await bottomBar(page).getByRole('button', { name: 'Mark complete' }).click()
  await expect(bottomBar(page).getByText('Done')).toBeVisible()
  await expect(bottomBar(page).getByRole('button', { name: 'Undo' })).toBeVisible()
  releaseAction()
  await actionAnswered
  await page.unroute(lessonUrl)

  await bottomBar(page).getByRole('link', { name: 'Next lesson' }).click()
  await expect(page.getByRole('heading', { name: 'Verbs', level: 1 })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  // SC-001: the Courses list and the course screen show the new progress as soon as they open.
  await page.goto('/s/courses')
  const card = page.getByRole('link', { name: /JLPT N4 Grammar/ })
  await expect(card.getByRole('progressbar', { name: 'JLPT N4 Grammar' })).toHaveAttribute(
    'aria-valuenow',
    '33',
    { timeout: 1000 },
  )
  await expect(card.getByText('33%')).toBeVisible({ timeout: 1000 })
  await expect(card.getByText(/1 of 3/)).toBeVisible({ timeout: 1000 })

  await page.goto(`/s/courses/${courseId}`)
  await expect(page.getByText('1 of 3 lessons')).toBeVisible({ timeout: 1000 })
  await expectNoSeriousA11yViolations(page)
})

test('scenario 2: "submit before complete" opens the Assignment tab instead', async ({ page }) => {
  const { lessonIds } = await grammarCourse()
  await sql(
    `insert into lesson_progress (student_id, lesson_id, status, completed_at, completed_by)
     values ($1, $2, 'done', now(), $1)`,
    [student.id, lessonIds[0]],
  )

  await page.goto(`/s/lessons/${lessonIds[1]}`)
  await bottomBar(page).getByRole('button', { name: 'Mark complete' }).click()
  await expect(page.getByRole('tab', { name: 'Assignment', selected: true })).toBeVisible()
  await expect(page.getByText('Submit your assignment to complete this lesson.')).toBeVisible()
  await expect(page.getByText('Write 5 sentences.')).toBeVisible()
  await expect(page).toHaveURL(/tab=assignment/)
  await expect(bottomBar(page).getByRole('button', { name: 'Mark complete' })).toBeVisible()
  const [row] = await sql<{ n: number }>(
    `select count(*)::int as n from lesson_progress where student_id = $1 and lesson_id = $2 and status = 'done'`,
    [student.id, lessonIds[1]],
  )
  expect(row.n).toBe(0)
  await expectNoSeriousA11yViolations(page)
})

test('scenario 3 and Edge Case: Undo returns the lesson and keeps later lessons open', async ({
  page,
}) => {
  const { lessonIds } = await grammarCourse()
  await sql(`update lessons set require_submission = false where id = $1`, [lessonIds[1]])

  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await bottomBar(page).getByRole('button', { name: 'Mark complete' }).click()
  await bottomBar(page).getByRole('link', { name: 'Next lesson' }).click()
  await expect(page.getByRole('heading', { name: 'Verbs', level: 1 })).toBeVisible()
  await clickAndSave(page, bottomBar(page).getByRole('button', { name: 'Mark complete' }))
  await expect(bottomBar(page).getByRole('button', { name: 'Undo' })).toBeVisible()

  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await clickAndSave(page, bottomBar(page).getByRole('button', { name: 'Undo' }))
  await expect(bottomBar(page).getByRole('button', { name: 'Mark complete' })).toBeVisible()

  await page.goto('/s/courses')
  await expect(page.getByRole('progressbar', { name: 'JLPT N4 Grammar' })).toHaveAttribute(
    'aria-valuenow',
    '33',
  )
  // Lesson 2 is still done, so it stays open although lesson 1 isn't done any more.
  await page.goto(`/s/lessons/${lessonIds[1]}`)
  await expect(page.getByRole('heading', { name: 'Verbs', level: 1 })).toBeVisible()
  await expect(bottomBar(page).getByRole('button', { name: 'Undo' })).toBeVisible()
})

test('scenario 4: the Admin marks a lesson done and reopens it; both are audited', async ({
  page,
  browser,
}, testInfo) => {
  const { lessonIds } = await grammarCourse()
  const zin = await signedInPage(browser, testInfo, admin)

  await zin.goto('/a/students')
  await zin.getByRole('link', { name: /May/ }).click()
  await expect(zin.getByRole('heading', { name: 'May', level: 1 })).toBeVisible()
  await zin.getByRole('link', { name: /Verbs/ }).click()
  await expect(zin.getByRole('heading', { name: 'Verbs', level: 1 })).toBeVisible()
  await expectNoSeriousA11yViolations(zin)

  // The Admin decides: "submit before complete" doesn't stop them (FR-002).
  await zin.getByRole('button', { name: 'Mark done' }).click()
  await expect(zin.getByText(/by Zin/)).toBeVisible()

  await page.goto(`/s/lessons/${lessonIds[1]}`)
  await expect(bottomBar(page).getByText('Marked done by Zin')).toBeVisible()

  await zin.getByRole('button', { name: 'Reopen' }).click()
  await expect(zin.getByRole('button', { name: 'Mark done' })).toBeVisible()

  const audit = () =>
    sql<{ action: string; target: { studentId: string; lessonId: string } }>(
      `select action, target from audit_log where actor_id = $1 order by id`,
      [admin.id],
    )
  // The bar changes optimistically; the audit row lands when the action finishes.
  await expect.poll(audit).toEqual([
    { action: 'lesson.complete', target: { studentId: student.id, lessonId: lessonIds[1] } },
    { action: 'lesson.reopen', target: { studentId: student.id, lessonId: lessonIds[1] } },
  ])
  await zin.context().close()
})
