import path from 'node:path'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import {
  assignCourse,
  linkStudent,
  removeCourseFiles,
  removeSubmissionFiles,
  seedCourse,
  seedSession,
  seedShift,
  seedSubmission,
  uploadLessonFile,
} from './fixtures/courses'
import { sql } from './fixtures/db'
import {
  cacheNames,
  databaseNames,
  goOffline,
  goOnline,
  outboxRows,
  waitForCachedPage,
  waitForKeptCourse,
  waitForSynced,
  waitForWorker,
} from './fixtures/offline'
import { createConfirmedUser, signIn, signedInPage, type TestUser } from './fixtures/users'

// Spec 008 User Story 2 – Study offline (research R2–R14; contracts/ui-routes.md). Needs a production
// build: the service worker only runs there. `context.setOffline` takes the page and the worker
// offline (technical spec §13). Device times are checked against when the test acted, not against a
// fake clock: Playwright installs its clock before a page loads.

const FILES = path.join(__dirname, 'fixtures', 'files')
const SECOND = 1000

let zin: TestUser
let may: TestUser
let courseId: string
let lessonIds: string[]

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
  ;({ courseId, lessonIds } = await seedCourse({
    ownerId: zin.id,
    title: 'Japanese N4',
    unlockInOrder: false,
    lessons: [
      { title: 'Particles', contentMd: '' },
      { title: 'Verbs', assignmentPrompt: 'Write 5 sentences with the て-form.' },
      { title: 'Adjectives', assignmentPrompt: 'Describe your room.' },
    ],
  }))
  const image = await uploadLessonFile(
    courseId,
    lessonIds[0],
    'notebook.png',
    readFileSync(path.join(FILES, 'notebook.png')),
    'image/png',
    'image',
  )
  await uploadLessonFile(
    courseId,
    lessonIds[0],
    'chart.pdf',
    Buffer.from('%PDF-1.4 chart'),
    'application/pdf',
  )
  await sql(`update lessons set content_md = $1 where id = $2`, [
    `![notebook](${image.url})\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ`,
    lessonIds[0],
  ])
  await assignCourse(courseId, may.id, zin.id)
})

test.afterEach(async () => {
  await removeCourseFiles([courseId])
  await removeSubmissionFiles([may.id])
})

const bottomBar = (page: Page) => page.getByRole('region', { name: 'Lesson actions' })
const answer = (page: Page) => page.getByRole('textbox', { name: 'Your answer' })
const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'Offline' })

/** Signed in as May with the worker in control and the course kept offline. */
async function keepCourseOffline(page: Page) {
  await signIn(page, may)
  await waitForWorker(page)
  await page.goto(`/s/courses/${courseId}`)
  await expect(page.getByRole('heading', { name: 'Japanese N4' })).toBeVisible()
  await waitForKeptCourse(page, courseId, 2) // the image and the PDF
}

test('scenarios 1–4: a kept course reads offline; complete, a draft with a photo and Submit sync with their times', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  await keepCourseOffline(page)
  await goOffline(context)

  // Scenario 1: the lesson, its image and its PDF open offline; video needs a connection.
  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await expect(page.getByRole('heading', { name: 'Particles' })).toBeVisible()
  const image = page.getByRole('img', { name: 'notebook' })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  const pdf = page.getByRole('link', { name: /chart\.pdf/ })
  // The network is off; the page's own request is answered from the worker's cache.
  expect(
    await page.evaluate(
      async (href) => (await fetch(href)).ok,
      (await pdf.getAttribute('href')) ?? '',
    ),
  ).toBe(true)
  await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0)

  // Scenario 2: complete → "Will sync".
  await bottomBar(page).getByRole('button', { name: 'Mark complete' }).click()
  const completedAt = Date.now()
  await expect(bottomBar(page).getByText('Will sync', { exact: true })).toBeVisible()

  // A draft with a photo, kept on the device.
  await page.goto(`/s/lessons/${lessonIds[1]}?tab=assignment`)
  await answer(page).fill('食べて、飲んで、寝ます。')
  await page.getByLabel('Add photo').setInputFiles(path.join(FILES, 'notebook.png'))
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(1)
  await expect(page.getByText('Will sync', { exact: true }).first()).toBeVisible()
  await expect.poll(async () => (await outboxRows(page)).length).toBe(2)

  // Scenario 3: Submit offline → "Will submit".
  await page.goto(`/s/lessons/${lessonIds[2]}?tab=assignment`)
  await answer(page).fill('My room is small but bright.')
  await page.getByRole('button', { name: 'Submit' }).click()
  const submittedAt = Date.now()
  await expect(page.getByText('Will submit', { exact: true })).toBeVisible()

  // Scenario 4: the banner says what will happen.
  await expect(banner(page)).toContainText('3 changes will sync')
  await expectNoSeriousA11yViolations(page)
  expect(await outboxRows(page)).toHaveLength(3)

  // Back online a few seconds later: everything syncs with the time the student acted.
  await page.waitForTimeout(4 * SECOND)
  await goOnline(context)
  await waitForSynced(page)

  const [progress] = await sql<{ completed_at: Date }>(
    `select completed_at from lesson_progress where student_id = $1 and lesson_id = $2 and status = 'done'`,
    [may.id, lessonIds[0]],
  )
  expect(Math.abs(progress.completed_at.getTime() - completedAt)).toBeLessThan(2 * SECOND)
  const [draft] = await sql<{ body_md: string; attachments: { path: string }[]; status: string }>(
    `select body_md, attachments, status from submissions where student_id = $1 and lesson_id = $2`,
    [may.id, lessonIds[1]],
  )
  expect(draft).toMatchObject({ body_md: '食べて、飲んで、寝ます。', status: 'draft' })
  expect(draft.attachments).toHaveLength(1)
  const [submitted] = await sql<{ status: string; submitted_at: Date }>(
    `select status, submitted_at from submissions where student_id = $1 and lesson_id = $2`,
    [may.id, lessonIds[2]],
  )
  expect(submitted.status).toBe('submitted')
  expect(Math.abs(submitted.submitted_at.getTime() - submittedAt)).toBeLessThan(2 * SECOND)
})

test('a draft changed elsewhere meanwhile is not saved, and the student can copy their text', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  await seedSubmission(may.id, lessonIds[1], 'draft', { bodyMd: 'first' })
  await keepCourseOffline(page)
  await page.goto(`/s/lessons/${lessonIds[1]}?tab=assignment`)
  await expect(answer(page)).toHaveValue('first')

  await goOffline(context)
  await answer(page).fill('written on the train')
  await expect(page.getByText('Will sync', { exact: true })).toBeVisible()
  await expect.poll(async () => (await outboxRows(page)).length).toBe(1)
  // Meanwhile, on another device.
  await sql(
    `update submissions set body_md = 'from the phone', updated_at = now() where student_id = $1 and lesson_id = $2`,
    [may.id, lessonIds[1]],
  )
  await goOnline(context)

  await page.getByRole('button', { name: 'View' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Not saved' })
  await expect(sheet).toContainText('Verbs')
  await expect(sheet).toContainText('changed on another device')
  await expect(sheet).toContainText('written on the train')
  await expectNoSeriousA11yViolations(page)
  await sheet.getByRole('button', { name: 'OK' }).click()
  await expect(sheet).toBeHidden()
  const [row] = await sql<{ body_md: string }>(
    `select body_md from submissions where student_id = $1 and lesson_id = $2`,
    [may.id, lessonIds[1]],
  )
  expect(row.body_md).toBe('from the phone')
})

test('shifts offline: a new shift, an edit and a delete sync; rotation needs a connection', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000)
  const day = (offset: number) => new Date(Date.UTC(2027, 1, 1 + offset)).toISOString().slice(0, 10)
  const edited = await seedShift(may.id, {
    type: 'day',
    startAt: `${day(1)}T00:00:00Z`,
    endAt: `${day(1)}T09:00:00Z`,
  })
  const removed = await seedShift(may.id, {
    type: 'day',
    startAt: `${day(2)}T00:00:00Z`,
    endAt: `${day(2)}T09:00:00Z`,
  })
  await signIn(page, may)
  await waitForWorker(page)
  await page.goto(`/s/shifts?month=2027-02&day=${day(1)}`)
  await waitForCachedPage(page, `/s/shifts/${edited}`)
  await waitForCachedPage(page, '/s/shifts/new')
  await page.goto('/s/shifts/rotation')
  await goOffline(context)

  // Rotation can't be queued.
  await page.reload()
  const saves = page.getByRole('button', { name: 'Save' })
  await expect(saves.first()).toBeVisible()
  for (const save of await saves.all()) {
    await expect(save).toBeDisabled()
    await expect(save).toHaveAttribute('aria-describedby', 'needs-connection')
  }
  await expect(banner(page)).toContainText('Editing needs a connection')

  // A new shift.
  await page.goto(`/s/shifts/new?date=${day(3)}`)
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText('Will sync', { exact: true }).first()).toBeVisible()
  // An edit and a delete of shifts saved online.
  await page.goto(`/s/shifts/${edited}`)
  await page.getByRole('radio', { name: 'Night' }).click()
  await page.getByRole('button', { name: 'Save' }).first().click()
  // Queued: the editor goes back to the month, as it does online.
  await expect(page).toHaveURL(/\/s\/shifts\?/)
  await page.goto(`/s/shifts/${removed}`)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  expect(await outboxRows(page)).toHaveLength(3)

  await goOnline(context)
  await waitForSynced(page)
  const rows = await sql<{ id: string; type: string; client_op_id: string | null }>(
    `select id, type, client_op_id from shifts where student_id = $1 order by start_at`,
    [may.id],
  )
  expect(rows.find((r) => r.id === edited)?.type).toBe('night')
  expect(rows.find((r) => r.id === removed)).toBeUndefined()
  expect(rows.filter((r) => r.client_op_id !== null)).toHaveLength(2) // the new one and the edit
})

test('focus: a session started online and stopped offline ends when it was stopped', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  await seedSession(may.id, lessonIds[0], {
    startedAt: new Date(Date.now() - 10 * 60 * SECOND),
    plannedMinutes: 25,
  })
  await keepCourseOffline(page)
  await page.goto(`/s/lessons/${lessonIds[0]}`)
  const stop = bottomBar(page).getByRole('button', { name: /· Stop$/ })
  await expect(stop).toBeVisible()

  await goOffline(context)
  await stop.click()
  const stoppedAt = Date.now()
  await page.waitForTimeout(3 * SECOND)
  await goOnline(context)
  await waitForSynced(page)
  const [row] = await sql<{ ended_at: Date }>(
    `select ended_at from study_sessions where student_id = $1`,
    [may.id],
  )
  expect(Math.abs(row.ended_at.getTime() - stoppedAt)).toBeLessThan(2 * SECOND)
})

test('an Admin offline reads saved data and every edit says it needs a connection', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const admin = await signedInPage(browser, testInfo, zin)
  await waitForWorker(admin)
  await admin.goto(`/a/courses/${courseId}`)
  await expect(admin.getByRole('heading', { name: 'Japanese N4' })).toBeVisible()
  await goOffline(admin.context())
  await admin.reload()

  await expect(banner(admin)).toContainText('Offline — showing saved data')
  await expect(admin.getByRole('heading', { name: 'Japanese N4' })).toBeVisible()
  const needsConnection = admin.locator('[aria-describedby~="needs-connection"]')
  expect(await needsConnection.count()).toBeGreaterThan(0)
  for (const control of await needsConnection.all()) await expect(control).toBeDisabled()
  await expectNoSeriousA11yViolations(admin)
  // Nothing that needs the server was sent while offline.
  const actions: string[] = []
  admin.on('request', (request) => {
    if (request.headers()['next-action']) actions.push(request.url())
  })
  await admin
    .getByRole('link', { name: 'Particles' })
    .first()
    .click()
    .catch(() => undefined)
  expect(actions).toEqual([])
})

test('sign-out with a change not synced asks first, then wipes this device', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  await keepCourseOffline(page)
  await page.goto('/s/me')
  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await goOffline(context)
  await bottomBar(page).getByRole('button', { name: 'Mark complete' }).click()
  await expect(bottomBar(page).getByText('Will sync', { exact: true })).toBeVisible()

  await page.goto('/s/me')
  await page.getByRole('button', { name: 'Sign out' }).click()
  const confirm = page.getByRole('alertdialog', { name: '1 change not synced yet' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/s\/me$/)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  expect(await databaseNames(page)).not.toContain('studymate')
  const caches = await cacheNames(page)
  expect(caches).not.toContain('pages')
  expect(caches).not.toContain('media')
})
