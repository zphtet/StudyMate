import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { seedCourse } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 002 User Story 2 – Admin builds lessons inside sections (screens 18-AdminCourse,
// 20-AdminLessonEdit).

let admin: TestUser

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  await signIn(page, admin)
})

const editorUrl = /\/a\/courses\/[0-9a-f-]{36}\/lessons\/[0-9a-f-]{36}\/edit$/

/** Phones switch Write / Preview; wide screens show both side by side. */
async function showPreview(page: Page) {
  await expect(page.getByLabel('Lesson text')).toBeAttached()
  const radio = page.getByRole('radio', { name: 'Preview' })
  if (await radio.isVisible()) await radio.check()
  return page.getByRole('region', { name: 'Preview' })
}

/** Lesson titles in course order, per section heading ('' = no section). */
async function listedOrder(page: Page) {
  return page.getByTestId('lesson-group').evaluateAll((groups) =>
    groups.map((g) => ({
      section: g.getAttribute('data-section-title') ?? '',
      lessons: [...g.querySelectorAll('[data-testid="lesson-title"]')].map((el) => el.textContent),
    })),
  )
}

/** Drag and drop and swipe work once React has hydrated; dnd-kit's live region appears then. */
async function waitForInteractiveList(page: Page) {
  await expect(page.locator('[id^="DndLiveRegion"]').first()).toBeAttached()
}

async function dragTo(page: Page, handle: Locator, target: Locator) {
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test('scenario 1: sections and lessons; the editor shows every field', async ({ page }) => {
  // Many round trips to the hosted dev project.
  test.slow()
  const { courseId } = await seedCourse({ ownerId: admin.id, title: 'Grammar', status: 'draft' })
  await page.goto(`/a/courses/${courseId}`)
  // No sections yet: the untitled group has its own "+ Add lesson".
  await expect(page.getByRole('button', { name: 'Add lesson' })).toHaveCount(1)

  for (const title of ['Week 1', 'Week 2']) {
    await page.getByRole('button', { name: 'Add section' }).click()
    await page.getByLabel('Section title').fill(title)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('region', { name: title })).toBeVisible()
  }

  await page
    .getByRole('region', { name: 'Week 1' })
    .getByRole('button', { name: 'Add lesson' })
    .click()
  await expect(page).toHaveURL(editorUrl)
  await expect(page.getByRole('heading', { name: 'Edit lesson' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('New lesson')
  await expect(page.getByLabel('Minutes')).toHaveValue('15')
  await expect(page.getByLabel('Section').locator('option:checked')).toHaveText('Week 1')
  await expect(page.getByLabel('Unlocks').locator('option:checked')).toHaveText(
    'After the previous lesson',
  )
  await expect(page.getByLabel('Lesson text')).toBeVisible()
  await expect(page.getByText('Attachments', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'File or link' })).toBeVisible()
  await expect(page.getByLabel('Assignment for the student')).toBeVisible()
  await expect(page.getByLabel('Submit assignment before marking complete')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('link', { name: 'Back to course' }).click()
  await page
    .getByRole('region', { name: 'Week 2' })
    .getByRole('button', { name: 'Add lesson' })
    .click()
  await expect(page).toHaveURL(editorUrl)
  // Next keeps the first editor in the page (hidden); use the visible one.
  await page.getByLabel('Title').filter({ visible: true }).fill('Verbs')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/courses/${courseId}$`))

  await expect(page.getByText('2 · Verbs')).toBeVisible()
  await expect(page.getByText('15 min · not visible to students').first()).toBeVisible()
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText('Drag ⋮⋮ to reorder lessons or move them between sections.', { exact: false }),
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test('scenario 2: Preview renders like the student view', async ({ page }) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [
      {
        title: 'Particles',
        contentMd: [
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
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ].join('\n'),
      },
    ],
  })
  await page.goto(`/a/courses/${courseId}/lessons/${lessonIds[0]}/edit`)
  const preview = await showPreview(page)
  await expect(preview.getByRole('heading', { name: 'は marks the topic' })).toBeVisible()
  await expect(preview.getByText('看護師です。')).toBeVisible()
  await expect(preview.getByText('မင်္ဂလာပါ')).toBeVisible()
  await expect(preview.getByRole('table')).toBeVisible()
  await expect(preview.locator('iframe[title="Video from YouTube"]')).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  )
})

test('scenario 3: reorder with the keyboard and by dragging across sections; order persists', async ({
  page,
}) => {
  test.slow()
  const { courseId } = await seedCourse({
    ownerId: admin.id,
    sections: ['Week 1', 'Week 2'],
    lessons: [
      { title: 'Alpha', section: 0 },
      { title: 'Beta', section: 0 },
      { title: 'Gamma', section: 1 },
    ],
  })
  await page.goto(`/a/courses/${courseId}`)
  await expect(page.getByText('1 · Alpha')).toBeVisible()
  await waitForInteractiveList(page)

  // Keyboard: pick up Alpha, move it down one place, drop.
  // Each step waits for the screen-reader announcement (dnd-kit listens for arrows a tick later).
  const announced = page.locator('[id^="DndLiveRegion"]').first()
  await page.getByRole('button', { name: 'Reorder Alpha' }).focus()
  await page.keyboard.press('Space')
  await expect(announced).toHaveText('Picked up Alpha.')
  await page.keyboard.press('ArrowDown')
  await expect(announced).toHaveText('Alpha is now at position 2 of 2 in Week 1.')
  await page.keyboard.press('Space')
  await expect(announced).toHaveText('Alpha was dropped at position 2 of 2 in Week 1.')
  await expect(page.getByText('1 · Beta')).toBeVisible()

  // Pointer: drag Beta onto Gamma in Week 2.
  await dragTo(
    page,
    page.getByRole('button', { name: 'Reorder Beta' }),
    page.getByTestId('lesson-row').filter({ hasText: 'Gamma' }),
  )
  await expect
    .poll(() => listedOrder(page))
    .toEqual([
      { section: 'Week 1', lessons: ['Alpha'] },
      { section: 'Week 2', lessons: expect.arrayContaining(['Beta', 'Gamma']) },
    ])

  // The new order shows at once; wait until the server has stored it, then reload.
  const stored = async () =>
    (
      await sql<{ title: string; section: string }>(
        `select l.title, s.title as section from lessons l join course_sections s on s.id = l.section_id
         where l.course_id = $1 and s.title = 'Week 1'`,
        [courseId],
      )
    ).map((r) => r.title)
  await expect.poll(stored).toEqual(['Alpha'])
  await page.reload()
  await waitForInteractiveList(page)
  const after = await listedOrder(page)
  expect(after[0]).toEqual({ section: 'Week 1', lessons: ['Alpha'] })
  expect([...after[1].lessons].sort()).toEqual(['Beta', 'Gamma'])
  const rows = await sql<{ title: string; position: number; section: string | null }>(
    `select l.title, l.position, s.title as section from lessons l left join course_sections s on s.id = l.section_id
     where l.course_id = $1 order by s.position, l.position`,
    [courseId],
  )
  expect(rows.map((r) => `${r.section}:${r.position}:${r.title}`)).toEqual([
    'Week 1:0:Alpha',
    ...after[1].lessons.map((title, i) => `Week 2:${i}:${title}`),
  ])
})

test('scenario 4: Publish shows the lesson as Published', async ({ page }) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [{ title: 'Particles', status: 'draft' }],
  })
  await page.goto(`/a/courses/${courseId}/lessons/${lessonIds[0]}/edit`)
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/courses/${courseId}$`))
  await expect(
    page.getByTestId('lesson-row').filter({ hasText: 'Particles' }).getByText('Published'),
  ).toBeVisible()
  const [row] = await sql<{ status: string }>(`select status from lessons where id = $1`, [
    lessonIds[0],
  ])
  expect(row.status).toBe('published')

  await page.goto(`/a/courses/${courseId}/lessons/${lessonIds[0]}/edit`)
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
})

test('scenario 5: autosave 3 s after typing shows "Saved hh:mm"; a Published lesson too', async ({
  page,
}) => {
  test.slow()
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [
      { title: 'Draft one', status: 'draft' },
      { title: 'Live one', status: 'published' },
    ],
  })
  const lessonRow = async (lessonId: string) =>
    (
      await sql<{ content_md: string; status: string; updated_at: Date }>(
        `select content_md, status, updated_at from lessons where id = $1`,
        [lessonId],
      )
    )[0]
  for (const [i, lessonId] of lessonIds.entries()) {
    await page.goto(`/a/courses/${courseId}/lessons/${lessonId}/edit`)
    const text = `Autosaved text ${i} は`
    await page.getByLabel('Lesson text').fill(text)
    // Nothing is sent before the 3 s pause.
    await page.waitForTimeout(1500)
    expect((await lessonRow(lessonId)).content_md).not.toBe(text)
    await expect
      .poll(async () => (await lessonRow(lessonId)).content_md, { timeout: 30_000 })
      .toBe(text)

    const row = await lessonRow(lessonId)
    // Published lessons are saved in place: students see the change at once.
    expect(row.status).toBe(i === 0 ? 'draft' : 'published')
    const hhmm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Yangon',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(row.updated_at)
    await expect(page.getByRole('status').getByText(`Saved ${hhmm}`)).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Lesson text')).toHaveValue(text)
  }
})

test('attachments: a PDF and an inline image upload; a 12 MB file is refused', async ({ page }) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [{ title: 'Files', contentMd: '' }],
  })
  await page.goto(`/a/courses/${courseId}/lessons/${lessonIds[0]}/edit`)

  // Attachment sheet: a too-large file is refused with a message, a small PDF is attached.
  await page.getByRole('button', { name: 'File or link' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add a file or link' })
  await sheet.getByLabel('Choose a file').setInputFiles({
    name: 'huge.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(12 * 1024 * 1024, 1),
  })
  await expect(sheet.getByText('Files can be up to 10 MB.')).toBeVisible()
  await sheet.getByLabel('Choose a file').setInputFiles({
    name: 'particles-chart.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 chart'),
  })
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('link', { name: 'particles-chart.pdf' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove particles-chart.pdf' })).toBeVisible()

  // The stable file URL redirects the owner to a signed URL.
  const href = await page.getByRole('link', { name: 'particles-chart.pdf' }).getAttribute('href')
  const response = await page.request.get(href!, { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers()['location']).toMatch(/\/storage\/v1\/object\/sign\/lesson-files\//)

  // Toolbar image: uploads and inserts Markdown; the preview shows it.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Insert image' }).click()
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByLabel('Lesson text')).toHaveValue(
    /!\[dot\.png\]\(\/api\/lesson-files\/[0-9a-f-]{36}\/dot\.png\)/,
  )
  const preview = await showPreview(page)
  await expect(preview.getByRole('img', { name: 'dot.png' })).toBeVisible()

  const resources = await sql<{ kind: string; name: string }>(
    `select kind, name from lesson_resources where lesson_id = $1 order by created_at`,
    [lessonIds[0]],
  )
  expect(resources).toEqual([
    { kind: 'file', name: 'particles-chart.pdf' },
    { kind: 'image', name: 'dot.png' },
  ])

  // Remove the attachment: row and file are gone.
  await page.getByRole('button', { name: 'Remove particles-chart.pdf' }).click()
  await expect(page.getByRole('link', { name: 'particles-chart.pdf' })).toHaveCount(0)
  const response2 = await page.request.get(href!, { maxRedirects: 0 })
  expect(response2.status()).toBe(404)
})

test('a link attachment opens in a new tab', async ({ page }) => {
  const { courseId, lessonIds } = await seedCourse({ ownerId: admin.id, lessons: [{ title: 'L' }] })
  await page.goto(`/a/courses/${courseId}/lessons/${lessonIds[0]}/edit`)
  await page.getByRole('button', { name: 'File or link' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add a file or link' })
  await sheet.getByRole('radio', { name: 'Link' }).check()
  await sheet.getByLabel('Link title').fill('NHK Easy')
  await sheet.getByLabel('Link address').fill('http://example.com')
  await sheet.getByRole('button', { name: 'Add link' }).click()
  await expect(sheet.getByText('Enter a link starting with https://')).toBeVisible()
  await sheet.getByLabel('Link address').fill('https://www3.nhk.or.jp/news/easy/')
  await sheet.getByRole('button', { name: 'Add link' }).click()
  await expect(sheet).toBeHidden()
  const link = page.getByRole('link', { name: 'NHK Easy' })
  await expect(link).toHaveAttribute('href', 'https://www3.nhk.or.jp/news/easy/')
  await expect(link).toHaveAttribute('target', '_blank')
})

test('swipe a lesson left to reveal Edit', async ({ page }) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    lessons: [{ title: 'Swipe me' }],
  })
  await page.goto(`/a/courses/${courseId}`)
  await waitForInteractiveList(page)
  const row = page.getByTestId('lesson-row').filter({ hasText: 'Swipe me' })
  const box = (await row.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width - 20, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 200, y, { steps: 10 })
  await page.mouse.up()
  const edit = page.getByRole('link', { name: 'Edit', exact: true })
  await expect(edit).toBeVisible()
  await edit.click()
  await expect(page).toHaveURL(new RegExp(`/lessons/${lessonIds[0]}/edit$`))
})

test('a section with lessons cannot be deleted; an empty one can', async ({ page }) => {
  const { courseId } = await seedCourse({
    ownerId: admin.id,
    sections: ['Full', 'Empty'],
    lessons: [{ title: 'Inside', section: 0 }],
  })
  await page.goto(`/a/courses/${courseId}`)
  await page.getByRole('button', { name: 'Section actions: Full' }).click()
  await expect(page.getByRole('menuitem', { name: 'Delete section' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Section actions: Empty' }).click()
  await page.getByRole('menuitem', { name: 'Delete section' }).click()
  await expect(page.getByRole('region', { name: 'Empty' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Full' })).toBeVisible()
})
