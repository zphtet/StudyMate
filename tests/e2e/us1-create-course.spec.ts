import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { seedCourse, uploadLessonFile } from './fixtures/courses'
import { sql } from './fixtures/db'
import { supabaseAdmin } from './fixtures/supabase-admin'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 002 User Story 1 – Admin creates a course (screens 17-AdminCourses, 19-AdminCourseForm).

let admin: TestUser

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  await signIn(page, admin)
})

test('scenario 1: a new Draft course is listed under Drafts, not Active', async ({ page }) => {
  await page.goto('/a/courses')
  await page.getByRole('link', { name: 'New course' }).click()
  await expect(page.getByRole('heading', { name: 'New course' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Change icon' }).click()
  await page.getByLabel('Type one character or emoji').fill('漢')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByLabel('Title').fill('JLPT N3 Grammar')
  await page.getByRole('radio', { name: 'Teal' }).check()
  await page.getByLabel('Description').fill('One grammar point per lesson.')
  await page.getByLabel('Target finish').fill('2027-03-31')
  await page.getByLabel('Level / tag').fill('N3')
  await expect(page.getByRole('radio', { name: 'Draft · only you see it' })).toBeChecked()
  await page.getByRole('button', { name: 'Create and add lessons' }).click()

  await expect(page).toHaveURL(/\/a\/courses\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'JLPT N3 Grammar' })).toBeVisible()
  await expect(page.getByText('Only you can see this course.')).toBeVisible()

  await page.goto('/a/courses')
  await expect(page.getByRole('button', { name: 'Drafts · 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Active · 0' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('JLPT N3 Grammar')).toHaveCount(0)
  await page.getByRole('button', { name: 'Drafts · 1' }).click()
  await expect(page.getByText('JLPT N3 Grammar')).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  const [row] = await sql<{ icon: string; color: string; level_tag: string; target_date: string }>(
    `select icon, color, level_tag, to_char(target_date, 'YYYY-MM-DD') as target_date from courses where owner_id = $1`,
    [admin.id],
  )
  expect(row).toEqual({ icon: '漢', color: 'teal', level_tag: 'N3', target_date: '2027-03-31' })
})

test('scenario 2: copying a course copies sections, lessons (as Draft) and files, but no students', async ({
  page,
}) => {
  // Copies a file through Storage on the hosted dev project.
  test.slow()
  const source = await seedCourse({
    ownerId: admin.id,
    title: 'Kanji N4',
    sections: ['Week 1', 'Week 2'],
    lessons: [
      { title: 'Radicals', section: 0 },
      { title: 'Readings', section: 1, status: 'draft' },
      { title: 'Gone', section: 1, deleted: true },
    ],
  })
  await uploadLessonFile(
    source.courseId,
    source.lessonIds[0],
    'chart.pdf',
    Buffer.from('%PDF-1.4 test'),
    'application/pdf',
  )

  await page.goto('/a/courses/new')
  await page.getByRole('radio', { name: 'Copy existing course' }).check()
  await page.getByLabel('Course to copy').selectOption({ label: 'Kanji N4' })
  await expect(page.getByLabel('Title')).toHaveValue('Kanji N4 (copy)')
  await page.getByRole('button', { name: 'Create and add lessons' }).click()
  await expect(page.getByRole('heading', { name: 'Kanji N4 (copy)' })).toBeVisible()

  const copyId = page.url().split('/').pop()!
  const sections = await sql(
    `select title from course_sections where course_id = $1 order by position`,
    [copyId],
  )
  expect(sections.map((s) => s.title)).toEqual(['Week 1', 'Week 2'])
  const lessons = await sql<{ title: string; status: string }>(
    `select title, status from lessons where course_id = $1 order by title`,
    [copyId],
  )
  expect(lessons).toEqual([
    { title: 'Radicals', status: 'draft' },
    { title: 'Readings', status: 'draft' },
  ])
  const [resource] = await sql<{ id: string; storage_path: string }>(
    `select r.id, r.storage_path from lesson_resources r join lessons l on l.id = r.lesson_id where l.course_id = $1`,
    [copyId],
  )
  expect(resource.storage_path.startsWith(`${copyId}/`)).toBe(true)
  // The file itself was duplicated into the new course's folder (reading it through the app is US2).
  const folder = resource.storage_path.slice(0, resource.storage_path.lastIndexOf('/'))
  const { data: files } = await supabaseAdmin().storage.from('lesson-files').list(folder)
  expect(files?.map((f) => `${folder}/${f.name}`)).toContain(resource.storage_path)
  const [{ n }] = await sql<{ n: number }>(
    `select count(*)::int n from course_assignments where course_id = $1`,
    [copyId],
  )
  expect(n).toBe(0)
})

test('scenario 3: making a Draft course Active moves it to Active', async ({ page }) => {
  const { courseId } = await seedCourse({ ownerId: admin.id, title: 'Listening', status: 'draft' })
  await page.goto(`/a/courses/${courseId}`)
  await page.getByRole('button', { name: 'Make active' }).click()
  await expect(page.getByText('Only you can see this course.')).toHaveCount(0)
  await expect(page.getByText('Active', { exact: true })).toBeVisible()
  await page.goto('/a/courses')
  await expect(page.getByRole('button', { name: 'Active · 1' })).toBeVisible()
  await expect(page.getByText('Listening')).toBeVisible()
})

test('duplicate as template opens the copy', async ({ page }) => {
  await seedCourse({
    ownerId: admin.id,
    title: 'Work phrases',
    sections: ['Basics'],
    lessons: [{ title: 'Greetings', section: 0 }],
  })
  await page.goto('/a/courses')
  await page.getByRole('button', { name: 'Course actions: Work phrases' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate as template' }).click()
  await expect(page.getByRole('heading', { name: 'Work phrases (copy)' })).toBeVisible()
  // The copy is a Draft course (its lessons show their own Draft chips too).
  await expect(page.getByText('Only you can see this course.')).toBeVisible()
})

test('search matches title and level tag; chips count each status (FR-009)', async ({ page }) => {
  await seedCourse({ ownerId: admin.id, title: 'JLPT N4 Grammar', levelTag: 'N4' })
  await seedCourse({ ownerId: admin.id, title: 'Kanji', levelTag: 'N3' })
  await seedCourse({ ownerId: admin.id, title: 'Old course', status: 'archived' })
  await page.goto('/a/courses')
  await expect(page.getByRole('button', { name: 'Active · 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archived · 1' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search courses' }).fill('n3')
  await expect(page.getByText('Kanji')).toBeVisible()
  await expect(page.getByText('JLPT N4 Grammar')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search courses' }).fill('zzz')
  await expect(page.getByText('No courses match')).toBeVisible()
})

test('the course list shows assigned students and their average progress (FR-009)', async ({
  page,
}) => {
  const student = await createConfirmedUser({ role: 'student', displayName: 'May' })
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'With students',
    lessons: [{ title: 'One' }, { title: 'Two' }],
  })
  await sql(`insert into student_links (student_id, admin_id, status) values ($1, $2, 'active')`, [
    student.id,
    admin.id,
  ])
  await sql(
    `insert into course_assignments (course_id, student_id, assigned_by) values ($1, $2, $3)`,
    [courseId, student.id, admin.id],
  )
  await sql(`insert into lesson_progress (student_id, lesson_id, status) values ($1, $2, 'done')`, [
    student.id,
    lessonIds[0],
  ])
  await page.goto('/a/courses')
  await expect(page.getByText('1 student · avg 50%')).toBeVisible()
})

test('changing "Unlock lessons in order" rewrites lesson rules but keeps dates', async ({
  page,
}) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'Rules',
    lessons: [
      { title: 'A', unlockRule: { type: 'none' } },
      { title: 'B', unlockRule: { type: 'after_previous' } },
      { title: 'C', unlockRule: { type: 'on_date', date: '2027-01-15' } },
    ],
  })
  const rules = async () =>
    (
      await sql<{ rule: unknown }>(
        `select unlock_rule as rule from lessons where id = any($1::uuid[]) order by title`,
        [lessonIds],
      )
    ).map((r) => r.rule)

  await page.goto(`/a/courses/${courseId}/edit`)
  await expect(
    page.getByText('Changing this updates the unlock setting of every lesson in the course.'),
  ).toBeVisible()
  await page.getByLabel('Unlock lessons in order').uncheck()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/courses/${courseId}$`))
  expect(await rules()).toEqual([
    { type: 'none' },
    { type: 'none' },
    { type: 'on_date', date: '2027-01-15' },
  ])

  await page.goto(`/a/courses/${courseId}/edit`)
  await page.getByLabel('Unlock lessons in order').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/courses/${courseId}$`))
  expect(await rules()).toEqual([
    { type: 'after_previous' },
    { type: 'after_previous' },
    { type: 'on_date', date: '2027-01-15' },
  ])
})

test('editing an Archived course keeps it archived', async ({ page }) => {
  const { courseId } = await seedCourse({ ownerId: admin.id, title: 'Retired', status: 'archived' })
  await page.goto(`/a/courses/${courseId}/edit`)
  await expect(page.getByRole('radio', { name: 'Active' })).toHaveCount(0)
  await page.getByLabel('Title').fill('Retired course')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/courses/${courseId}$`))
  const [row] = await sql<{ title: string; status: string }>(
    `select title, status from courses where id = $1`,
    [courseId],
  )
  expect(row).toEqual({ title: 'Retired course', status: 'archived' })
})
