import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import {
  assignCourse,
  linkStudent,
  markDone,
  seedCourse,
  uploadLessonFile,
} from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 002 User Story 4 – Student reads lessons (screens 05-Courses, 09-Course, 10-Lesson; partial
// per contracts/ui-routes.md). Assignments (003) and completions (004) are seeded directly.

let admin: TestUser
let student: TestUser

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  student = await createConfirmedUser({
    role: 'student',
    displayName: 'May',
    timezone: 'Asia/Yangon',
  })
  await linkStudent(student.id, admin.id)
  await signIn(page, student)
})

/** Lesson titles per section heading on the student course page ('' = no section). */
async function shownOrder(page: Page) {
  return page.getByTestId('student-lesson-group').evaluateAll((groups) =>
    groups.map((g) => ({
      section: g.getAttribute('data-section-title') ?? '',
      lessons: [...g.querySelectorAll('[data-testid="student-lesson-title"]')].map(
        (el) => el.textContent,
      ),
    })),
  )
}

const notFound = (page: Page) =>
  expect(page.getByText('This page could not be found.')).toBeVisible()

test('the Courses tab lists assigned Active and Archived courses only', async ({ page }) => {
  const active = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    targetDate: '2026-12-31',
    lessons: [
      { title: 'One' },
      { title: 'Two' },
      { title: 'Three' },
      { title: 'Hidden draft', status: 'draft' },
    ],
  })
  const archived = await seedCourse({ ownerId: admin.id, title: 'Old kanji', status: 'archived' })
  const draft = await seedCourse({ ownerId: admin.id, title: 'Not ready', status: 'draft' })
  await seedCourse({ ownerId: admin.id, title: 'Someone else’s' })
  for (const c of [active, archived, draft]) await assignCourse(c.courseId, student.id, admin.id)

  await page.goto('/s/courses')
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Active · 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const card = page.getByRole('link', { name: /JLPT N4 Grammar/ })
  await expect(card).toBeVisible()
  // Spec 003 US3 scenario 5: the card shows the student's own course deadline, not the target date.
  // Spec 004 US1: active cards count done of total ("12 of 20" on screen 05-Courses).
  await expect(card).toContainText('0 of 3 · no deadline')
  await expect(page.getByText('Not ready')).toHaveCount(0)
  await expect(page.getByText('Someone else’s')).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Archived · 1' }).click()
  await expect(page.getByRole('link', { name: /Old kanji/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /JLPT N4 Grammar/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Old kanji/ }).click()
  await expect(page).toHaveURL(new RegExp(`/s/courses/${archived.courseId}$`))
  await expect(page.getByText('Archived · completed lessons stay available')).toBeVisible()
})

test('an empty Courses tab explains that nothing is assigned yet', async ({ page }) => {
  await page.goto('/s/courses')
  await expect(page.getByText("Your admin hasn't assigned a course yet.")).toBeVisible()
})

test('scenario 1: sections and Published lessons in order with minutes; no Drafts', async ({
  page,
}) => {
  const { courseId } = await seedCourse({
    ownerId: admin.id,
    title: 'Grammar',
    targetDate: '2026-12-31',
    sections: ['Week 1', 'Week 2', 'Empty week'],
    lessons: [
      { title: 'Intro', section: null, unlockRule: { type: 'none' } },
      { title: 'Particles', section: 0, estMinutes: 20, unlockRule: { type: 'none' } },
      { title: 'Secret draft', section: 0, status: 'draft' },
      { title: 'Verbs', section: 1, unlockRule: { type: 'none' } },
      { title: 'Deleted one', section: 1, deleted: true },
    ],
  })
  await assignCourse(courseId, student.id, admin.id)
  await page.goto(`/s/courses/${courseId}`)

  await expect(page.getByRole('heading', { name: 'Grammar', level: 1 })).toBeVisible()
  // Spec 003 US3 scenario 4: "finish by" only with a course deadline (the target date isn't one).
  await expect(page.getByText('Assigned by Zin', { exact: true })).toBeVisible()
  expect(await shownOrder(page)).toEqual([
    { section: '', lessons: ['Intro'] },
    { section: 'Week 1', lessons: ['Particles'] },
    { section: 'Week 2', lessons: ['Verbs'] },
  ])
  const particles = page.getByTestId('student-lesson-row').filter({ hasText: 'Particles' })
  await expect(particles).toContainText('20 min')
  await expect(particles).toContainText('2')
  await expect(page.getByText('Secret draft')).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)
})

test('scenario 2: after_previous and on_date lessons are Locked until they open', async ({
  page,
}) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'Paced',
    lessons: [
      { title: 'First' },
      { title: 'Second' },
      { title: 'Future', unlockRule: { type: 'on_date', date: '2099-01-15' } },
    ],
  })
  await assignCourse(courseId, student.id, admin.id)
  await page.goto(`/s/courses/${courseId}`)

  const second = page.getByTestId('student-lesson-row').filter({ hasText: 'Second' })
  await expect(second).toContainText('unlocks after 1')
  await expect(second).toContainText('Locked')
  await expect(second).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('link', { name: /Second/ })).toHaveCount(0)
  const future = page.getByTestId('student-lesson-row').filter({ hasText: 'Future' })
  await expect(future).toContainText(/opens .*2099/)
  await expect(page.getByRole('link', { name: /First/ })).toBeVisible()

  // The locked lesson's own URL refuses to open it.
  await page.goto(`/s/lessons/${lessonIds[1]}`)
  await expect(page.getByRole('heading', { name: "This lesson isn't open yet" })).toBeVisible()
  await expect(page.getByText('It unlocks after lesson 1, First.')).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  const response = await page.request.get(`/api/lessons/${lessonIds[1]}`)
  expect(response.status()).toBe(403)
  expect((await response.json()).error.code).toBe('lesson_locked')

  // Completing the previous lesson (004 "Mark complete", seeded here) opens it.
  await markDone(student.id, lessonIds[0])
  await page.goto(`/s/courses/${courseId}`)
  await page.getByRole('link', { name: /Second/ }).click()
  await expect(page).toHaveURL(new RegExp(`/s/lessons/${lessonIds[1]}$`))
  await expect(page.getByRole('heading', { name: 'Second', level: 1 })).toBeVisible()
})

test('scenario 3: a lesson renders Japanese, Burmese, a table, an image, audio and YouTube', async ({
  page,
}) => {
  test.slow()
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'Grammar',
    lessons: [
      {
        title: 'Particles は vs が',
        estMinutes: 15,
        assignmentPrompt: 'Write 5 sentences: 3 with は and 2 with が.',
      },
    ],
  })
  const lessonId = lessonIds[0]
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const image = await uploadLessonFile(courseId, lessonId, 'chart.png', png, 'image/png', 'image')
  const audio = await uploadLessonFile(
    courseId,
    lessonId,
    'listening.mp3',
    Buffer.from('ID3'),
    'audio/mpeg',
    'audio',
  )
  const pdf = await uploadLessonFile(
    courseId,
    lessonId,
    'particles-chart.pdf',
    Buffer.from('%PDF-1.4 chart'),
    'application/pdf',
  )
  await sql(
    `insert into lesson_resources (lesson_id, kind, name, url) values ($1, 'link', 'NHK Easy', 'https://www3.nhk.or.jp/news/easy/')`,
    [lessonId],
  )
  await sql(`update lessons set content_md = $2 where id = $1`, [
    lessonId,
    [
      '## は marks the topic',
      '',
      '私**は**看護師です。',
      '',
      'မင်္ဂလာပါ',
      '',
      '| Particle | Use |',
      '| --- | --- |',
      '| は | topic |',
      '',
      `![Particle chart](${image.url})`,
      '',
      `![Listening](${audio.url})`,
      '',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ].join('\n'),
  ])
  await assignCourse(courseId, student.id, admin.id)

  await page.goto(`/s/lessons/${lessonId}`)
  await expect(page.getByText('Grammar · Lesson 1 of 1')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Particles は vs が', level: 1 })).toBeVisible()
  await expect(page.getByText('15 min')).toBeVisible()
  const body = page.getByRole('article')
  await expect(body.getByRole('heading', { name: 'は marks the topic' })).toBeVisible()
  await expect(body.getByText('看護師です。')).toBeVisible()
  await expect(body.getByText('မင်္ဂလာပါ')).toBeVisible()
  await expect(body.getByRole('table')).toBeVisible()
  await expect(body.getByRole('img', { name: 'Particle chart' })).toHaveAttribute('src', image.url)
  await expect(body.locator('audio')).toHaveAttribute('src', audio.url)
  await expect(body.locator('iframe[title="Video from YouTube"]')).toHaveAttribute(
    'src',
    /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  )

  // Attachments: the file (with its size) and the link.
  await expect(page.getByRole('link', { name: /particles-chart\.pdf/ })).toHaveAttribute(
    'href',
    pdf.url,
  )
  const link = page.getByRole('link', { name: /NHK Easy/ })
  await expect(link).toHaveAttribute('href', 'https://www3.nhk.or.jp/news/easy/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(page.getByText('Write 5 sentences: 3 with は and 2 with が.')).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  // The student can open the lesson's files (signed URL); the image itself loads.
  const file = await page.request.get(pdf.url, { maxRedirects: 0 })
  expect(file.status()).toBe(302)
  await expect
    .poll(() =>
      body
        .getByRole('img', { name: 'Particle chart' })
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
    )
    .toBeGreaterThan(0)
})

test("an admin's edit to a Published lesson shows on the student's next load", async ({
  page,
  browser,
}) => {
  test.slow()
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [{ title: 'Live', contentMd: 'Old text' }],
  })
  await assignCourse(courseId, student.id, admin.id)
  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await expect(page.getByRole('article').getByText('Old text')).toBeVisible()

  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const adminPage = await adminContext.newPage()
  await signIn(adminPage, admin)
  await adminPage.goto(`/a/courses/${courseId}/lessons/${lessonIds[0]}/edit`)
  await adminPage.getByLabel('Lesson text').fill('New text from the admin')
  await expect
    .poll(
      async () =>
        (
          await sql<{ content_md: string }>(`select content_md from lessons where id = $1`, [
            lessonIds[0],
          ])
        )[0].content_md,
      { timeout: 30_000 },
    )
    .toBe('New text from the admin')
  await adminContext.close()

  await page.reload()
  await expect(page.getByRole('article').getByText('New text from the admin')).toBeVisible()
})

test('unassigned courses, Draft courses, Draft lessons and their files are not found', async ({
  page,
}) => {
  const other = await seedCourse({ ownerId: admin.id, lessons: [{ title: 'Elsewhere' }] })
  const draftCourse = await seedCourse({
    ownerId: admin.id,
    status: 'draft',
    lessons: [{ title: 'In a draft course' }],
  })
  await assignCourse(draftCourse.courseId, student.id, admin.id)
  const mine = await seedCourse({
    ownerId: admin.id,
    lessons: [{ title: 'Visible' }, { title: 'Draft lesson', status: 'draft' }],
  })
  await assignCourse(mine.courseId, student.id, admin.id)
  const draftFile = await uploadLessonFile(
    mine.courseId,
    mine.lessonIds[1],
    'secret.pdf',
    Buffer.from('%PDF'),
    'application/pdf',
  )

  await page.goto(`/s/courses/${other.courseId}`)
  await notFound(page)
  await page.goto(`/s/courses/${draftCourse.courseId}`)
  await notFound(page)
  await page.goto(`/s/lessons/${draftCourse.lessonIds[0]}`)
  await notFound(page)
  await page.goto(`/s/lessons/${mine.lessonIds[1]}`)
  await notFound(page)

  for (const path of [
    `/api/courses/${other.courseId}`,
    `/api/lessons/${mine.lessonIds[1]}`,
    `/api/lessons/${other.lessonIds[0]}`,
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404)
  }
  const file = await page.request.get(draftFile.url, { maxRedirects: 0 })
  expect(file.status()).toBe(404)
})

test("a locked lesson's files are refused", async ({ page }) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [{ title: 'First' }, { title: 'Second' }],
  })
  await assignCourse(courseId, student.id, admin.id)
  const file = await uploadLessonFile(
    courseId,
    lessonIds[1],
    'later.pdf',
    Buffer.from('%PDF'),
    'application/pdf',
  )
  await page.goto('/s/courses')
  const response = await page.request.get(file.url, { maxRedirects: 0 })
  expect(response.status()).toBe(403)
  expect((await response.json()).error.code).toBe('lesson_locked')
})
