import { expect, test, type Page } from '@playwright/test'
import { todayIn, zonedToUtc } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse, seedShift } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 003 User Story 1 – Admin assigns a course to one or many students (screens 18-AdminCourse,
// 23-AdminAssign). Zin (admin) is in Yangon; May is in Tokyo and Thant in Yangon.

const TOKYO = 'Asia/Tokyo'
const DAY = 86_400_000

let admin: TestUser
let may: TestUser
let thant: TestUser

const localDate = (timeZone: string, days: number) =>
  new Date(Date.parse(`${todayIn(timeZone)}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)

const studentCard = (page: Page, name: string) =>
  page.getByTestId('assign-student').filter({ hasText: name })

async function openAssign(page: Page, courseId: string) {
  await page.goto(`/a/courses/${courseId}`)
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Assign course' })).toBeVisible()
}

const assignmentOf = async (courseId: string, studentId: string) =>
  (
    await sql<{ status: string; due_at: Date | null; assigned_by: string }>(
      `select status, due_at, assigned_by from course_assignments where course_id = $1 and student_id = $2`,
      [courseId, studentId],
    )
  )[0]

test.beforeEach(async () => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: TOKYO })
  thant = await createConfirmedUser({ role: 'student', displayName: 'Thant' })
})

async function linkBoth() {
  await linkStudent(may.id, admin.id)
  await linkStudent(thant.id, admin.id)
}

test('scenarios 1–3: both students listed with cities; Due starts at the target date 23:59 in their zone; each gets their own deadline', async ({
  page,
}) => {
  await linkBoth()
  const target = localDate(TOKYO, 40)
  const { courseId } = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    targetDate: target,
    lessons: [{ title: 'One' }],
  })
  await signIn(page, admin)
  await openAssign(page, courseId)

  await expect(page.getByText('JLPT N4 Grammar · pick any linked students')).toBeVisible()
  await expect(page.getByText('Students · 0 of 2 selected')).toBeVisible()
  await expect(studentCard(page, 'May')).toContainText('Tokyo')
  await expect(studentCard(page, 'Thant')).toContainText('Yangon')

  await page.getByRole('checkbox', { name: 'May' }).click()
  await page.getByRole('checkbox', { name: 'Thant' }).click()
  await expect(page.getByText('Students · 2 of 2 selected')).toBeVisible()
  await expect(studentCard(page, 'May').getByLabel('Due date')).toHaveValue(target)
  await expect(studentCard(page, 'May').getByLabel('Time')).toHaveValue('23:59')
  // Thant: no deadline.
  await studentCard(page, 'Thant').getByRole('button', { name: 'No deadline' }).click()
  await expect(studentCard(page, 'Thant').getByLabel('Due date')).toHaveValue('')
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Assign to 2 students' }).click()
  await expect(page.getByText('Assignments saved')).toBeVisible()
  await expect(page.getByText(/May.* · Thant/)).toBeVisible()
  const mine = await assignmentOf(courseId, may.id)
  expect(mine).toMatchObject({ status: 'active', assigned_by: admin.id })
  expect(mine.due_at?.toISOString()).toBe(zonedToUtc(target, null, TOKYO).toISOString())
  expect((await assignmentOf(courseId, thant.id)).due_at).toBeNull()

  await page.context().clearCookies()
  await signIn(page, may)
  await page.goto('/s/courses')
  await expect(page.getByRole('link', { name: /JLPT N4 Grammar/ })).toContainText(
    `due ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: TOKYO }).format(mine.due_at!)}`,
  )
})

test('scenario 2: the admin sees both clocks, and a time inside a shift offers "Move to …"', async ({
  page,
}) => {
  await linkStudent(may.id, admin.id)
  const day = localDate(TOKYO, 3)
  const shiftStart = zonedToUtc(day, '22:00', TOKYO)
  await seedShift(may.id, {
    startAt: shiftStart.toISOString(),
    endAt: new Date(shiftStart.getTime() + 9 * 3_600_000).toISOString(),
  })
  const { courseId } = await seedCourse({ ownerId: admin.id, lessons: [{ title: 'One' }] })
  await signIn(page, admin)
  await openAssign(page, courseId)

  await page.getByRole('checkbox', { name: 'May' }).click()
  const card = studentCard(page, 'May')
  await card.getByLabel('Due date').fill(day)
  await card.getByLabel('Time').fill('23:00')
  await expect(card).toContainText(/23:00 \(Tokyo\) · 20:30 \(Yangon\)/)
  await expect(card.getByText('May is on shift then')).toBeVisible()
  // Shift until 07:00, then outside waking hours until 08:00: one free hour → 09:00 next day.
  await card.getByRole('button', { name: /^Move to / }).click()
  await expect(card.getByLabel('Due date')).toHaveValue(localDate(TOKYO, 4))
  await expect(card.getByLabel('Time')).toHaveValue('09:00')
  await expect(card.getByText('May is on shift then')).toHaveCount(0)
})

test('scenarios 4–5: reopening shows the current deadline; unticking asks first and unassigns', async ({
  page,
}) => {
  await linkBoth()
  const { courseId } = await seedCourse({
    ownerId: admin.id,
    title: 'Kanji N4',
    lessons: [{ title: 'One' }],
  })
  const due = zonedToUtc(localDate(TOKYO, 20), '18:30', TOKYO).toISOString()
  await assignCourse(courseId, may.id, admin.id, { dueAt: due })
  await signIn(page, admin)
  await openAssign(page, courseId)

  await expect(page.getByRole('checkbox', { name: 'May' })).toBeChecked()
  await expect(studentCard(page, 'May').getByLabel('Time')).toHaveValue('18:30')
  await expect(page.getByRole('checkbox', { name: 'Thant' })).not.toBeChecked()

  await page.getByRole('checkbox', { name: 'May' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Unassign May?')
  await expect(dialog).toContainText('Their progress is kept.')
  await dialog.getByRole('button', { name: 'Unassign' }).click()
  await expect(page.getByText('Assignments saved')).toBeVisible()
  expect((await assignmentOf(courseId, may.id)).status).toBe('removed')

  await page.context().clearCookies()
  await signIn(page, may)
  await page.goto('/s/courses')
  await expect(page.getByText('Kanji N4')).toHaveCount(0)
})

test('scenarios 6–8: reminders, notices and the unlock setting are saved', async ({ page }) => {
  await linkStudent(may.id, admin.id)
  const { courseId } = await seedCourse({
    ownerId: admin.id,
    title: 'Listening',
    unlockInOrder: true,
    lessons: [{ title: 'One' }, { title: 'Two' }],
  })
  await signIn(page, admin)
  await openAssign(page, courseId)

  await expect(page.getByText('Applies to every student of this course')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Add default reminders' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Notify students now' })).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'May' }).click()
  await page.getByRole('checkbox', { name: 'Unlock lessons in order' }).click()
  await page.getByRole('checkbox', { name: 'Notify students now' }).click()
  await page.getByRole('button', { name: 'Assign to 1 student' }).click()
  await expect(page.getByText('Assignments saved')).toBeVisible()

  const rules = await sql<{ trigger: string }>(
    `select trigger from notification_rules where owner_id = $1 and student_id = $2 and config->>'preset' = 'default'`,
    [admin.id, may.id],
  )
  expect(rules.map((r) => r.trigger).sort()).toEqual([
    'daily',
    'due_soon',
    'overdue',
    'streak_risk',
  ])
  const notices = await sql<{ title: string }>(
    `select title from notifications where user_id = $1 and source_id = $2 and occurrence_key = 'assigned'`,
    [may.id, courseId],
  )
  expect(notices.map((n) => n.title)).toEqual(['New course: Listening'])
  const [course] = await sql<{ unlock_in_order: boolean }>(
    `select unlock_in_order from courses where id = $1`,
    [courseId],
  )
  expect(course.unlock_in_order).toBe(false)
})

test('a Draft course has no Assign button', async ({ page }) => {
  await linkStudent(may.id, admin.id)
  const { courseId } = await seedCourse({ ownerId: admin.id, status: 'draft' })
  await signIn(page, admin)
  await page.goto(`/a/courses/${courseId}`)
  await expect(page.getByRole('button', { name: 'Make Active' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assign', exact: true })).toHaveCount(0)
})

test('no linked students → the sheet says so and links to invites', async ({ page }) => {
  const { courseId } = await seedCourse({ ownerId: admin.id, lessons: [{ title: 'One' }] })
  await signIn(page, admin)
  await openAssign(page, courseId)
  await expect(page.getByText('No linked students yet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Invite students' })).toHaveAttribute(
    'href',
    '/a/students',
  )
})
