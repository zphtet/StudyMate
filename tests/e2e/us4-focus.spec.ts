import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse, seedSession } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 004 User Story 4 – Focus timer logs study time (screen 10-Lesson bottom bar; research.md R3,
// contracts/ui-routes.md › Bottom bar). Sessions are seeded with `seedSession` so a test doesn't wait
// 15 real minutes. The lesson screen has no minutes line (10-Lesson.png), so the lesson's time is
// read from the database and the day's from the Progress calendar.

const ZONE = 'Asia/Tokyo'
const MINUTE = 60_000
const tokyoDate = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, dateStyle: 'short' }).format(at)

let student: TestUser
let lessonIds: string[]

test.beforeEach(async ({ page }) => {
  test.slow()
  const admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  student = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: ZONE })
  await linkStudent(student.id, admin.id)
  const course = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    unlockInOrder: false,
    lessons: [{ title: 'Particles は vs が' }, { title: 'Verbs' }],
  })
  await assignCourse(course.courseId, student.id, admin.id)
  lessonIds = course.lessonIds
  await signIn(page, student)
})

const bottomBar = (page: Page) => page.getByRole('region', { name: 'Lesson actions' })

async function countedSeconds(lessonId: string) {
  const [row] = await sql<{ seconds: number }>(
    `select coalesce(sum(extract(epoch from least(coalesce(ended_at, now()),
       started_at + planned_minutes * interval '1 minute') - started_at)), 0)::int as seconds
     from study_sessions where student_id = $1 and lesson_id = $2`,
    [student.id, lessonId],
  )
  return row.seconds
}

/** The Progress calendar cell of the student's local day `at`. */
async function expectDayStudied(page: Page, at: Date, minutes: number) {
  await page.goto('/s/progress')
  await expect(page.locator(`button[data-date="${tokyoDate(at)}"]`)).toHaveAccessibleName(
    new RegExp(`${minutes} min studied`),
  )
}

test('scenario 1: a running timer counts down, stops itself at 0 and adds 15 min', async ({
  page,
}) => {
  const startedAt = new Date(Date.now() - 14 * MINUTE - 50_000)
  await seedSession(student.id, lessonIds[0], { startedAt, plannedMinutes: 15 })

  await page.goto(`/s/lessons/${lessonIds[0]}`)
  const stop = bottomBar(page).getByRole('button', { name: /^0:[01]\d · Stop$/ })
  await expect(stop).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await expect(page.getByText('Focus done · 15 min added')).toBeVisible({ timeout: 30_000 })
  await expect(bottomBar(page).getByRole('button', { name: 'Focus 15' })).toBeVisible()
  const [row] = await sql<{ ended_at: Date | null }>(
    `select ended_at from study_sessions where student_id = $1`,
    [student.id],
  )
  expect(row.ended_at?.getTime()).toBe(startedAt.getTime() + 15 * MINUTE)
  expect(await countedSeconds(lessonIds[0])).toBe(15 * 60)
  await expectDayStudied(page, startedAt, 15)
})

test('Focus 25 from the menu; stopping within seconds counts nothing (FR-007)', async ({
  page,
}) => {
  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await bottomBar(page).getByRole('button', { name: 'Focus length' }).click()
  const started = page.waitForResponse((r) => r.request().method() === 'POST' && r.ok())
  await page.getByRole('menuitem', { name: '25 min' }).click()
  await started

  const stop = bottomBar(page).getByRole('button', { name: /^2[45]:\d\d · Stop$/ })
  await expect(stop).toBeVisible()
  const [running] = await sql<{ planned_minutes: number }>(
    `select planned_minutes from study_sessions where student_id = $1 and ended_at is null`,
    [student.id],
  )
  expect(running.planned_minutes).toBe(25)
  await expectNoSeriousA11yViolations(page)

  const stopped = page.waitForResponse((r) => r.request().method() === 'POST' && r.ok())
  await stop.click()
  await stopped
  await expect(bottomBar(page).getByRole('button', { name: 'Focus 15' })).toBeVisible()
  const [count] = await sql<{ n: number }>(
    `select count(*)::int as n from study_sessions where student_id = $1`,
    [student.id],
  )
  expect(count.n).toBe(0)
})

test('scenario 2: a timer left for 3 h shows no countdown and counts exactly 15 min', async ({
  page,
}) => {
  // The calendar shows this month, so this assumes 3 h ago is in it (not 00:00–03:00 Tokyo on the 1st).
  const startedAt = new Date(Date.now() - 3 * 60 * MINUTE)
  await seedSession(student.id, lessonIds[0], { startedAt, plannedMinutes: 15 })

  await page.goto(`/s/lessons/${lessonIds[0]}`)
  await expect(bottomBar(page).getByRole('button', { name: 'Focus 15' })).toBeVisible()
  await expect(bottomBar(page).getByRole('button', { name: /Stop/ })).toHaveCount(0)
  expect(await countedSeconds(lessonIds[0])).toBe(15 * 60)
  await expectDayStudied(page, startedAt, 15)
})

test('a timer on another lesson shows "Focus running · {lesson}" and links there', async ({
  page,
}) => {
  await seedSession(student.id, lessonIds[0], {
    startedAt: new Date(Date.now() - MINUTE),
    plannedMinutes: 15,
  })

  await page.goto(`/s/lessons/${lessonIds[1]}`)
  const running = bottomBar(page).getByRole('link', { name: 'Focus running · Particles は vs が' })
  await expect(running).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await running.click()
  await expect(page.getByRole('heading', { name: 'Particles は vs が', level: 1 })).toBeVisible()
  await expect(bottomBar(page).getByRole('button', { name: /^1[34]:\d\d · Stop$/ })).toBeVisible()
})
