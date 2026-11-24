import { expect, test, type Locator, type Page } from '@playwright/test'
import { addCalendarDays, mondayOf, todayIn, utcToZoned, zonedToUtc } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse, setLessonDeadline } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 003 User Story 2 – Admin sets and changes deadlines (screen 22-AdminPlan, partial: the
// availability bars, clashes and Month view come with US4). Zin (admin) is in Yangon, May in
// Tokyo. Everything happens NEXT week, so every card is in the future whenever the suite runs.

const TOKYO = 'Asia/Tokyo'

let admin: TestUser
let may: TestUser
let monday: string

const at = (day: number, time: string) =>
  zonedToUtc(addCalendarDays(monday, day), time, TOKYO).toISOString()
const day = (page: Page, offset: number) =>
  page.locator(`[data-testid="plan-day"][data-date="${addCalendarDays(monday, offset)}"]`)
const card = (page: Page, title: string) =>
  page.getByTestId('deadline-card').filter({ hasText: title })

async function openPlan(page: Page) {
  await page.goto(`/a/plan?student=${may.id}&week=${monday}`)
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible()
}

async function seed() {
  const course = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    lessons: [
      { title: 'Particles は vs が', estMinutes: 15 },
      { title: 'Particle で for means' },
      { title: 'Secret draft', status: 'draft' },
    ],
  })
  await assignCourse(course.courseId, may.id, admin.id, { dueAt: at(4, '21:00') })
  return course
}

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: TOKYO })
  await linkStudent(may.id, admin.id)
  monday = addCalendarDays(mondayOf(todayIn(TOKYO)), 7)
  await signIn(page, admin)
})

test('scenarios 1–2 and FR-008: one course card on the course date, lesson cards on their own day, both clocks', async ({
  page,
}) => {
  const course = await seed()
  await setLessonDeadline(course.lessonIds[0], may.id, at(1, '20:00'), admin.id)
  await openPlan(page)

  await expect(page.getByRole('button', { name: 'May', pressed: true })).toBeVisible()
  await expect(page.getByText('Times in Tokyo time')).toBeVisible()
  await expect(day(page, 4).getByTestId('deadline-card')).toHaveCount(1)
  await expect(card(page, 'JLPT N4 Grammar')).toContainText('21:00 · 18:30 yours')
  await expect(day(page, 1).getByTestId('deadline-card')).toHaveCount(1)
  await expect(card(page, 'Particles は vs が')).toContainText('20:00 · 17:30 yours')
  await expect(
    page.getByText(
      'Long-press a deadline and drag it to another day to reschedule. May gets a notification.',
    ),
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page).toHaveURL(new RegExp(`week=${addCalendarDays(monday, -7)}`))
  await expect(page.getByTestId('deadline-card')).toHaveCount(0)
})

test('scenario 3: "+ Deadline" adds a lesson deadline, with the overdue and later-than-course notes', async ({
  page,
}) => {
  const course = await seed()
  await openPlan(page)
  await page.getByRole('button', { name: 'Deadline' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: 'Add deadline' })).toBeVisible()
  await expect(sheet.getByLabel('Deadline for').locator('option')).toHaveText([
    'Whole course',
    '1 · Particles は vs が',
    '2 · Particle で for means',
  ])
  await sheet.getByLabel('Deadline for').selectOption({ label: '2 · Particle で for means' })

  await sheet.getByLabel('Due date').fill(addCalendarDays(todayIn(TOKYO), -1))
  await sheet.getByLabel('Time').fill('10:00')
  await expect(sheet.getByText('Already overdue')).toBeVisible()
  await sheet.getByLabel('Due date').fill(addCalendarDays(monday, 6))
  await expect(sheet.getByText('Later than the course deadline')).toBeVisible()
  await sheet.getByLabel('Due date').fill(addCalendarDays(monday, 2))
  await sheet.getByLabel('Time').fill('19:00')
  await expect(sheet.getByText(/19:00 \(Tokyo\) · 16:30 \(Yangon\)/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Save deadline' }).click()

  await expect(page.getByText('Deadline saved')).toBeVisible()
  await expect(day(page, 2)).toContainText('Particle で for means')
  const [row] = await sql<{ due_at: Date; set_by: string }>(
    `select due_at, set_by from lesson_deadlines where lesson_id = $1 and student_id = $2`,
    [course.lessonIds[1], may.id],
  )
  expect(row.set_by).toBe(admin.id)
  expect(row.due_at.toISOString()).toBe(at(2, '19:00'))
})

test('scenario 3: "Whole course" replaces the course deadline', async ({ page }) => {
  await seed()
  await openPlan(page)
  await page.getByRole('button', { name: 'Deadline' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByLabel('Time')).toHaveValue('21:00') // the current course deadline
  await sheet.getByLabel('Due date').fill(addCalendarDays(monday, 5))
  await sheet.getByRole('button', { name: 'Save deadline' }).click()
  await expect(day(page, 5)).toContainText('JLPT N4 Grammar')
  await expect(day(page, 4).getByTestId('deadline-card')).toHaveCount(0)
})

test('scenario 4: drag a card to another day keeps its local time; keyboard does the same', async ({
  page,
}) => {
  const course = await seed()
  await setLessonDeadline(course.lessonIds[0], may.id, at(1, '20:00'), admin.id)
  await openPlan(page)

  // Pointer drag: Tue → Thu. The week can re-render once after load, so measure until both boxes exist.
  const from = await boxOf(card(page, 'Particles は vs が'))
  const to = await boxOf(day(page, 3))
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(day(page, 3)).toContainText('Particles は vs が')
  await expect.poll(() => dueOf(course.lessonIds[0])).toBe(at(3, '20:00'))
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Keyboard: Space, ↓, Space → Fri, same 20:00 (pauses let dnd-kit measure the rows, as a person would).
  await card(page, 'Particles は vs が').focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(200)
  await page.keyboard.press('Space')
  await expect(day(page, 4)).toContainText('Particles は vs が')
  await expect.poll(() => dueOf(course.lessonIds[0])).toBe(at(4, '20:00'))
  expect(utcToZoned(at(4, '20:00'), TOKYO).time).toBe('20:00')
})

test('done cards cannot be dragged', async ({ page }) => {
  const course = await seed()
  await setLessonDeadline(course.lessonIds[0], may.id, at(1, '20:00'), admin.id)
  await sql(
    `insert into lesson_progress (student_id, lesson_id, status, completed_at) values ($1, $2, 'done', now())`,
    [may.id, course.lessonIds[0]],
  )
  await openPlan(page)
  const done = card(page, 'Particles は vs が')
  await expect(done).toContainText('Done')
  await expect(done).toHaveAttribute('aria-disabled', 'true')
})

test('scenarios 5–6: tap to change the time, then Remove; one notice per lesson', async ({
  page,
}) => {
  // Many writes and page loads against the hosted dev database (as in us3-day).
  test.setTimeout(120_000)
  const course = await seed()
  await setLessonDeadline(course.lessonIds[0], may.id, at(1, '20:00'), admin.id)
  await openPlan(page)

  await card(page, 'Particles は vs が').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: 'Change deadline' })).toBeVisible()
  await expect(sheet.getByLabel('Deadline for')).toHaveValue(course.lessonIds[0])
  await sheet.getByLabel('Time').fill('18:00')
  await sheet.getByRole('button', { name: 'Save deadline' }).click()
  await expect(card(page, 'Particles は vs が')).toContainText('18:00 · 15:30 yours')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => dueOf(course.lessonIds[0])).toBe(at(1, '18:00'))

  await card(page, 'Particles は vs が').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove deadline' }).click()
  await expect(page.getByText('Deadline removed')).toBeVisible()
  await expect(card(page, 'Particles は vs が')).toHaveCount(0)
  expect(await dueOf(course.lessonIds[0])).toBeNull()

  const notices = await sql<{ title: string; read_at: Date | null }>(
    `select title, read_at from notifications where user_id = $1 and source_id = $2 and occurrence_key = 'deadline'`,
    [may.id, course.lessonIds[0]],
  )
  expect(notices).toHaveLength(1)
  expect(notices[0].title).toMatch(/^Particles は vs が is now due /) // falls back to the course date
})

type Box = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>

async function boxOf(target: Locator): Promise<Box> {
  for (let tries = 0; tries < 50; tries++) {
    const box = await target.boundingBox()
    if (box) return box
    await target.page().waitForTimeout(100)
  }
  throw new Error('missing layout')
}

async function dueOf(lessonId: string) {
  const [row] = await sql<{ due_at: Date }>(
    `select due_at from lesson_deadlines where lesson_id = $1 and student_id = $2`,
    [lessonId, may.id],
  )
  return row?.due_at.toISOString() ?? null
}
