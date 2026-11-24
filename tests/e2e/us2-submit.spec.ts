import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signedInPage, signIn, type TestUser } from './fixtures/users'

// Spec 004 User Story 2 – Write and submit an assignment (screen 10-Lesson; contracts/ui-routes.md ›
// Lesson, Lesson review, Students). Linking (001) and assignments (003) are seeded directly. Live
// updates go through Realtime (research.md R10): no reloads, 5 s (SC-002). Each test drives two or
// three browsers against the hosted dev database, so they get the slow-test timeout.

const FILES = path.join(__dirname, 'fixtures', 'files')
const LIVE = { timeout: 5_000 }

let admin: TestUser
let student: TestUser

test.beforeEach(async ({ page }) => {
  test.slow()
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  student = await createConfirmedUser({
    role: 'student',
    displayName: 'May',
    timezone: 'Asia/Tokyo',
  })
  await linkStudent(student.id, admin.id)
  await signIn(page, student)
})

/** One open lesson with a prompt, assigned to `to`. */
async function verbsCourse(...to: TestUser[]) {
  const course = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    color: 'teal',
    lessons: [
      {
        title: 'Verbs',
        estMinutes: 20,
        unlockRule: { type: 'none' },
        assignmentPrompt: 'Write 5 sentences with the て-form.',
      },
    ],
  })
  for (const user of to) await assignCourse(course.courseId, user.id, admin.id)
  return { courseId: course.courseId, lessonId: course.lessonIds[0] }
}

const answer = (page: Page) => page.getByRole('textbox', { name: 'Your answer' })
const tab = (page: Page, name: string | RegExp) => page.getByRole('tab', { name })

async function percentOf(courseId: string) {
  const [row] = await sql<{ percent: number | null }>(
    `select percent::int from course_progress where student_id = $1 and course_id = $2`,
    [student.id, courseId],
  )
  return row?.percent ?? null
}

test('scenario 1: the draft autosaves with text and photos; the Admin never sees a Draft', async ({
  page,
  browser,
}, testInfo) => {
  const { lessonId } = await verbsCourse(student)

  await page.goto(`/s/lessons/${lessonId}?tab=assignment`)
  await expect(page.getByText('Write 5 sentences with the て-form.')).toBeVisible()
  await answer(page).fill('食べて、飲んで、寝ます。')
  await expect(page.getByText(/Draft saved/)).toBeVisible()
  await page.reload()
  await expect(answer(page)).toHaveValue('食べて、飲んで、寝ます。')

  // Two photos, one over 2 MB before resizing; each stored object is at most 2 MB (FR-003).
  await page
    .getByLabel('Add photo')
    .setInputFiles([path.join(FILES, 'photo-large.jpg'), path.join(FILES, 'notebook.png')])
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(2)
  await expect
    .poll(async () => {
      const [row] = await sql<{ images: number }>(
        `select jsonb_array_length(attachments) as images from submissions
         where student_id = $1 and lesson_id = $2`,
        [student.id, lessonId],
      )
      return row?.images
    })
    .toBe(2)
  await expect
    .poll(async () => {
      const rows = await sql<{ size: number; mimetype: string }>(
        `select (metadata->>'size')::int as size, metadata->>'mimetype' as mimetype
         from storage.objects where bucket_id = 'submissions' and name like $1`,
        [`${student.id}/${lessonId}/%`],
      )
      return rows.map((r) => r.size <= 2_097_152 && /image\/(webp|jpeg)/.test(r.mimetype))
    })
    .toEqual([true, true])
  await page.reload()
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(2)
  await expectNoSeriousA11yViolations(page)

  // The Admin sees no chip, no submission and can't open the Draft's files.
  const zin = await signedInPage(browser, testInfo, admin)
  await zin.goto(`/a/students/${student.id}`)
  const row = zin.getByRole('link', { name: /Verbs/ })
  await expect(row).toBeVisible()
  await expect(row.getByText(/Submitted|Reviewed|Needs redo|Draft/)).toHaveCount(0)
  await zin.goto(`/a/students/${student.id}/lessons/${lessonId}`)
  await expect(zin.getByText("May hasn't submitted yet.")).toBeVisible()
  const [draft] = await sql<{ id: string; name: string }>(
    `select id, split_part(attachments->0->>'path', '/', 3) as name from submissions
     where student_id = $1 and lesson_id = $2`,
    [student.id, lessonId],
  )
  const file = await zin.request.get(`/api/submissions/${draft.id}/files/${draft.name}`, {
    maxRedirects: 0,
  })
  expect(file.status()).toBe(404)
  await zin.context().close()
})

test('scenarios 2–4: submit, the Admin reviews live, Needs redo, resubmit; progress never changes', async ({
  page,
  browser,
}, testInfo) => {
  const { courseId, lessonId } = await verbsCourse(student)
  const zin = await signedInPage(browser, testInfo, admin)
  await zin.goto('/a/students')
  const card = zin.getByRole('article', { name: 'May' })
  await expect(card).toBeVisible()
  await expect(card.getByText(/to review/)).toHaveCount(0)

  // Scenario 2: Submit → Submitted, read-only; the open Students screen shows it within 5 s.
  await page.goto(`/s/lessons/${lessonId}?tab=assignment`)
  await answer(page).fill('食べて、飲んで、寝ます。')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible()
  await expect(answer(page)).toHaveCount(0)
  await expect(page.getByText('食べて、飲んで、寝ます。')).toBeVisible()
  await expect(card.getByText('1 to review')).toBeVisible(LIVE)
  expect(await percentOf(courseId)).toBe(0)

  // Scenario 3: comment + Needs redo → the student's open lesson shows it within 5 s.
  await card.getByRole('link', { name: 'May', exact: true }).click()
  await expect(zin.getByRole('heading', { name: 'To review · 1' })).toBeVisible()
  await zin.getByRole('link', { name: /Verbs/ }).first().click()
  await expect(zin.getByText('食べて、飲んで、寝ます。')).toBeVisible()
  await expectNoSeriousA11yViolations(zin)
  await zin.getByLabel('Comment for May').fill('Check the third verb.')
  await zin.getByRole('button', { name: 'Needs redo' }).click()
  await expect(
    zin.getByRole('list', { name: 'Feedback' }).getByText('Check the third verb.'),
  ).toBeVisible()

  await expect(page.getByText('Zin asked for a redo.')).toBeVisible(LIVE)
  await expect(page.getByText('Check the third verb.')).toBeVisible(LIVE)
  await expect(answer(page)).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  expect(await percentOf(courseId)).toBe(0)

  // Scenario 4: edit and resubmit → Submitted again; the Admin's review screen updates live.
  await answer(page).fill('食べて、飲んで、寝て、起きます。')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible()
  await expect(zin.getByText('食べて、飲んで、寝て、起きます。')).toBeVisible(LIVE)

  await zin.getByRole('button', { name: 'Reviewed' }).click()
  // Still live (no reload); SC-002's 5 s budget is for the Admin's side, checked above.
  await expect(page.getByText('Reviewed', { exact: true })).toBeVisible()
  expect(await percentOf(courseId)).toBe(0)
  await zin.context().close()
})

test('scenario 5: Notes both ways; another student never sees the thread', async ({
  page,
  browser,
}, testInfo) => {
  const ko = await createConfirmedUser({ role: 'student', displayName: 'Ko' })
  await linkStudent(ko.id, admin.id)
  const { lessonId } = await verbsCourse(student, ko)

  await page.goto(`/s/lessons/${lessonId}`)
  await tab(page, 'Notes').click()
  await expect(page).toHaveURL(/tab=notes/)
  await expect(page.getByText('Ask a question or leave a note for Zin.')).toBeVisible()
  await page.getByLabel('Write a note').fill('Is て-form of 行く 行って?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(tab(page, 'Notes · 1')).toBeVisible()

  const zin = await signedInPage(browser, testInfo, admin)
  await zin.goto(`/a/students/${student.id}/lessons/${lessonId}`)
  await tab(zin, 'Notes · 1').click()
  await expect(zin.getByText('Is て-form of 行く 行って?')).toBeVisible()
  await zin.getByLabel('Write a note').fill('Yes, 行って is right.')
  await zin.getByRole('button', { name: 'Send' }).click()
  await expect(tab(zin, 'Notes · 2')).toBeVisible()
  await expectNoSeriousA11yViolations(zin)

  await expect(tab(page, 'Notes · 2')).toBeVisible(LIVE)
  await expect(page.getByText('Yes, 行って is right.')).toBeVisible(LIVE)
  await expectNoSeriousA11yViolations(page)
  await zin.context().close()

  const koPage = await signedInPage(browser, testInfo, ko)
  await koPage.goto(`/s/lessons/${lessonId}?tab=notes`)
  await expect(tab(koPage, 'Notes')).toBeVisible()
  await expect(koPage.getByText('Ask a question or leave a note for Zin.')).toBeVisible()
  await expect(koPage.getByText('Is て-form of 行く 行って?')).toHaveCount(0)
  await koPage.context().close()
})
