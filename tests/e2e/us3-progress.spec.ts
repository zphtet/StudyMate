import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, markDone, seedCourse } from './fixtures/courses'
import { createConfirmedUser, signedInPage, signIn, type TestUser } from './fixtures/users'

// Spec 004 User Story 3 – See progress (screens 06-Progress, 04-Today, 05-Courses, 11-Profile and
// 16-AdminStudents, partial per contracts/ui-routes.md). History is seeded with `markDone`; dates
// are the student's own (Tokyo), relative to the real today so the test runs on any day.

const ZONE = 'Asia/Tokyo'
const DAY = 86_400_000
const tokyoDate = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, dateStyle: 'short' }).format(at)
const today = tokyoDate(new Date())
/** Noon in Tokyo, `days` before today. */
const noonAgo = (days: number) => new Date(Date.parse(`${today}T12:00:00+09:00`) - days * DAY)
/** Days Monday..today of this local week. */
const daysIntoWeek = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7

let admin: TestUser
let student: TestUser

test.beforeEach(async ({ page }) => {
  test.slow()
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  student = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: ZONE })
  await linkStudent(student.id, admin.id)
  await seedHistory()
  await signIn(page, student)
})

/**
 * Grammar (20 lessons, due in 60 days): a run of 6 active days ending today and an older best run of
 * 9; 8 of its completions fall in the last 14 days → On track. Today's completion credits 45 min.
 * Kanji (10 lessons, due yesterday, 1 done) → Behind and 9 overdue. Listening has no published
 * lessons → "—".
 */
async function seedHistory() {
  const lessons = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ title: `${prefix} ${i + 1}`, estMinutes: 15 }))
  const grammar = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    color: 'indigo',
    lessons: lessons('Grammar', 20),
  })
  const kanji = await seedCourse({
    ownerId: admin.id,
    title: 'Kanji N4',
    color: 'teal',
    unlockInOrder: false,
    lessons: lessons('Kanji', 10),
  })
  const empty = await seedCourse({
    ownerId: admin.id,
    title: 'Listening Practice',
    color: 'rust',
    lessons: [{ title: 'Draft only', status: 'draft' }],
  })
  await assignCourse(grammar.courseId, student.id, admin.id, {
    dueAt: new Date(Date.now() + 60 * DAY).toISOString(),
  })
  await assignCourse(kanji.courseId, student.id, admin.id, {
    dueAt: `${tokyoDate(new Date(Date.now() - DAY))}T23:59:00+09:00`,
  })
  await assignCourse(empty.courseId, student.id, admin.id)

  const done = (lessonId: string, completedAt: Date, minutesSpent = 0) =>
    markDone(student.id, lessonId, { completedAt, completedBy: student.id, minutesSpent })
  await done(grammar.lessonIds[0], new Date(), 45) // today, 45 min
  for (let d = 1; d <= 5; d++) await done(grammar.lessonIds[d], noonAgo(d))
  for (let d = 12; d <= 20; d++) await done(grammar.lessonIds[d - 6], noonAgo(d)) // best run of 9
  await done(kanji.lessonIds[0], noonAgo(3))
}

const progressCourse = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) })

test('scenario 1: Month view — streak, time, lessons done, heat calendar and weekly goal', async ({
  page,
}) => {
  await page.goto('/s/progress')
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Month' })).toBeChecked()
  await expect(page.getByText('Day streak')).toBeVisible()
  await expect(page.getByText('Best: 9')).toBeVisible()
  await expect(
    page.getByText(`Weekly goal: ${Math.min(daysIntoWeek + 1, 6)} of 5 days`),
  ).toBeVisible()

  // Today's cell is shaded at 45 min and named so.
  const todayCell = page.locator(`button[data-date="${today}"]`)
  await expect(todayCell).toHaveAccessibleName(/45 min studied/)
  await expect(todayCell).toHaveClass(/bg-heat-3/)
  await expectNoSeriousA11yViolations(page)

  // Week view: the toggle is kept in the URL; seven bars.
  await page.getByRole('radio', { name: 'Week' }).check()
  await expect(page).toHaveURL(/view=week/)
  await expect(
    page.getByRole('list', { name: 'Study time by day' }).getByRole('listitem'),
  ).toHaveCount(7)
  await expect(page.getByText(/vs last week|Same as last week/)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked()
  await expectNoSeriousA11yViolations(page)
})

test('scenario 2 and Edge Case: the finish forecast per course; no published lessons is "—"', async ({
  page,
}) => {
  await page.goto('/s/progress')
  await expect(
    progressCourse(page, 'JLPT N4 Grammar').getByText(/^On track · finishes ~/),
  ).toBeVisible()
  await expect(progressCourse(page, 'JLPT N4 Grammar').getByText('75%')).toBeVisible()
  await expect(
    progressCourse(page, 'Kanji N4').getByText(/^Behind · ~.+ at this pace, due /),
  ).toBeVisible()
  const listening = progressCourse(page, 'Listening Practice')
  await expect(listening.getByText('—')).toBeVisible()
  await expect(listening.getByText('No lessons yet')).toBeVisible()
})

test('Today: streak, weekly goal and Continue; Courses: "Studied this week"', async ({ page }) => {
  await page.goto('/s/today')
  await expect(page.getByText('6 days')).toBeVisible()
  await expect(page.getByText('Study streak')).toBeVisible()
  await expect(
    page.getByText(`${Math.min(daysIntoWeek + 1, 6)} of 5`, { exact: true }),
  ).toBeVisible()
  const next = page.getByRole('link', { name: 'Continue Grammar 16' })
  await expect(next).toBeVisible()
  await expect(page.getByText('JLPT N4 Grammar · 15 of 20 done')).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await next.click()
  await expect(page.getByRole('heading', { name: 'Grammar 16', level: 1 })).toBeVisible()

  await page.goto('/s/courses')
  const week = page.getByRole('region', { name: 'Studied this week' })
  await expect(week.getByRole('list', { name: 'Study time by day' })).toBeVisible()
  await expect(week.getByText(/lessons? done$/)).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test('the weekly goal on Me changes "of 5" to "of 3"', async ({ page }) => {
  await page.goto('/s/me')
  await page.getByRole('button', { name: /Weekly goal/ }).click()
  await expect(page.getByText('Days a week you want to study')).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('radio', { name: '3' }).click()
  await expect(page.getByRole('button', { name: /Weekly goal.*3 days/ })).toBeVisible()

  await page.goto('/s/progress')
  await expect(page.getByText(/^Weekly goal: \d of 3 days$/)).toBeVisible()
})

test('scenario 3: the Admin card shows streak, this week, lessons done, bars and overdue', async ({
  browser,
}, testInfo) => {
  const zin = await signedInPage(browser, testInfo, admin)
  await zin.goto('/a/students')
  const card = zin.getByRole('article', { name: 'May' })
  await expect(card.getByText('9 overdue')).toBeVisible()
  const tile = (label: string) =>
    card.locator('div').filter({ has: zin.getByText(label, { exact: true }) })
  await expect(tile('Day streak').getByText('6', { exact: true })).toBeVisible()
  await expect(tile('This week').getByText(/\d+ (min|h \d+ m)/)).toBeVisible()
  await expect(tile('Lessons done').getByText(/^\d+$/)).toBeVisible()
  await expect(card.getByRole('progressbar', { name: 'JLPT N4 Grammar' })).toHaveAttribute(
    'aria-valuenow',
    '75',
  )
  await expect(card.getByRole('progressbar', { name: 'Listening Practice' })).toBeVisible()
  await expectNoSeriousA11yViolations(zin)
  await zin.context().close()
})
