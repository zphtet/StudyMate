import { expect, test, type Page } from '@playwright/test'
import { addCalendarDays, mondayOf, todayIn, zonedToUtc } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import {
  assignCourse,
  linkStudent,
  seedCourse,
  seedShift,
  setLessonDeadline,
} from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 003 User Story 4 – Admin sees the plan per student (screen 22-AdminPlan). Zin (admin) is in
// Yangon, May in Tokyo (waking 08:00–23:00 by default) with a night shift NEXT Fri 22:00 – Sat 07:00
// and 8 h sleep after it (30 min buffer: 07:30–15:30). Tokyo is 2 h 30 ahead of Yangon.

const TOKYO = 'Asia/Tokyo'
const PLAIN_DAY = 'Sleep 00:00–08:00, Free 08:00–23:00, Sleep 23:00–24:00'

let admin: TestUser
let may: TestUser
let monday: string

const at = (day: number, time: string) =>
  zonedToUtc(addCalendarDays(monday, day), time, TOKYO).toISOString()
const day = (page: Page, offset: number) =>
  page.locator(`[data-testid="plan-day"][data-date="${addCalendarDays(monday, offset)}"]`)
const item = (page: Page, title: string) =>
  page.getByTestId('deadline-item').filter({ hasText: title })

async function openWeek(page: Page, student: TestUser = may, week: string | null = monday) {
  await page.goto(`/a/plan?student=${student.id}${week ? `&week=${week}` : ''}`)
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible()
}

async function seedFor(student: TestUser, dueAt?: string) {
  const course = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    lessons: [
      { title: 'Listening · Lesson 5', estMinutes: 15 },
      { title: 'Kanji set 12' },
      { title: 'Particles は vs が' },
    ],
  })
  await assignCourse(course.courseId, student.id, admin.id, { dueAt })
  return course
}

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: TOKYO })
  await linkStudent(may.id, admin.id)
  monday = addCalendarDays(mondayOf(todayIn(TOKYO)), 7)
  await seedShift(may.id, { startAt: at(4, '22:00'), endAt: at(5, '07:00'), sleepMinutes: 480 })
  await signIn(page, admin)
})

test('scenario 1: a bar per day in the student’s time, with the legend; today has the now-marker', async ({
  page,
}) => {
  await seedFor(may)
  await openWeek(page)
  await expect(page.getByRole('list', { name: 'Key' })).toHaveText(
    ['Shift', 'Sleep', 'Free'].join(''),
  )
  await expect(day(page, 0).getByTestId('day-bar')).toHaveAccessibleName(PLAIN_DAY)
  await expect(day(page, 4).getByTestId('day-bar')).toHaveAccessibleName(
    'Sleep 00:00–08:00, Free 08:00–22:00, Shift 22:00–24:00',
  )
  await expect(day(page, 5).getByTestId('day-bar')).toHaveAccessibleName(
    'Shift 00:00–07:00, Sleep 07:00–15:30, Free 15:30–23:00, Sleep 23:00–24:00',
  )
  await expect(page.getByTestId('now-marker')).toHaveCount(0) // next week has no "now"

  await openWeek(page, may, null)
  const today = page.locator('[data-testid="plan-day"][aria-current="date"]')
  await expect(today).toHaveAttribute('data-date', todayIn(TOKYO))
  await expect(today.getByTestId('now-marker')).toBeVisible()
  await expect(page.getByTestId('now-marker')).toHaveCount(1)
  await expect(today.getByTestId('day-bar')).toHaveAccessibleName(/, now \d\d:\d\d$/)
})

test('scenario 2: a deadline in a shift offers "Move to" the first free time that fits; tapping moves it', async ({
  page,
}) => {
  const course = await seedFor(may)
  const lesson = course.lessonIds[0]
  await setLessonDeadline(lesson, may.id, at(4, '23:00'), admin.id)
  await openWeek(page)

  const clash = item(page, 'Listening · Lesson 5')
  await expect(clash).toContainText('May is on shift then')
  // Free from Sat 15:30; 15 min → at least an hour → 16:30 → rounded up to 17:00 (14:30 in Yangon).
  const move = clash.getByRole('button', { name: 'Move to Sat 17:00 · 14:30 yours' })
  await expect(move).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await move.click()
  await expect(day(page, 5).getByTestId('deadline-card')).toContainText('17:00 · 14:30 yours')
  await expect(item(page, 'Listening · Lesson 5')).not.toContainText('is on shift then')
  await expect.poll(() => dueOf(lesson)).toBe(at(5, '17:00'))
  await expect
    .poll(async () => {
      const [row] = await sql<{ count: string }>(
        `select count(*) from notifications where user_id = $1 and source_id = $2 and occurrence_key = 'deadline'`,
        [may.id, lesson],
      )
      return Number(row.count)
    })
    .toBe(1)
})

test('scenario 2: a deadline in the sleep after a shift says "asleep"; quiet hours are not a clash', async ({
  page,
}) => {
  const course = await seedFor(may)
  await sql(`update profiles set quiet_start = '21:00', quiet_end = '07:00' where id = $1`, [
    may.id,
  ])
  await setLessonDeadline(course.lessonIds[1], may.id, at(5, '10:00'), admin.id)
  await setLessonDeadline(course.lessonIds[2], may.id, at(2, '21:30'), admin.id)
  await openWeek(page)

  await expect(item(page, 'Kanji set 12')).toContainText('May is asleep then')
  await expect(item(page, 'Particles は vs が')).toContainText('21:30')
  await expect(item(page, 'Particles は vs が')).not.toContainText(
    /is on shift then|is asleep then/,
  )
  await expect(day(page, 2).getByTestId('day-bar')).toHaveAccessibleName(PLAIN_DAY)
})

test('scenarios 3–4: Month counts per day (red when late, one per course deadline); a day opens its week', async ({
  page,
}) => {
  const course = await seedFor(may, at(0, '21:00')) // whole course: one card, not three
  await setLessonDeadline(course.lessonIds[0], may.id, at(0, '10:00'), admin.id)
  const yesterday = addCalendarDays(todayIn(TOKYO), -1)
  await setLessonDeadline(
    course.lessonIds[1],
    may.id,
    zonedToUtc(yesterday, '10:00', TOKYO).toISOString(),
    admin.id,
  )

  // Week → Month opens the month of the week on screen.
  await openWeek(page)
  await page.getByRole('radio', { name: 'Month' }).click()
  await expect(page).toHaveURL(new RegExp(`view=month&month=${monday.slice(0, 7)}`))
  await expect(page.getByRole('radio', { name: 'Month' })).toBeChecked()
  const mondayCell = page.locator(`button[data-date="${monday}"]`)
  await expect(mondayCell.getByTestId('month-count')).toHaveText('2, 2 deadlines')
  await expect(mondayCell.getByTestId('month-count')).not.toHaveClass(/text-destructive/)
  await expectNoSeriousA11yViolations(page)

  await mondayCell.click()
  await expect(page).toHaveURL(new RegExp(`week=${monday}`))
  await expect(page).not.toHaveURL(/view=month/)
  await expect(day(page, 0).getByTestId('deadline-card')).toHaveCount(2)

  await page.goto(`/a/plan?student=${may.id}&view=month&month=${yesterday.slice(0, 7)}`)
  const late = page.locator(`button[data-date="${yesterday}"]`).getByTestId('month-count')
  await expect(late).toHaveText('1, 1 deadline, 1 late')
  await expect(late).toHaveClass(/text-destructive/)
})

test('scenario 5: a student with no shifts sees bars from availability settings only, and no clash', async ({
  page,
}) => {
  const aki = await createConfirmedUser({ role: 'student', displayName: 'Aki', timezone: TOKYO })
  await linkStudent(aki.id, admin.id)
  const course = await seedFor(aki)
  await setLessonDeadline(course.lessonIds[0], aki.id, at(4, '21:00'), admin.id)
  await openWeek(page, aki)

  for (const offset of [0, 4, 5, 6]) {
    await expect(day(page, offset).getByTestId('day-bar')).toHaveAccessibleName(PLAIN_DAY)
  }
  await expect(item(page, 'Listening · Lesson 5')).toContainText('21:00')
  await expect(item(page, 'Listening · Lesson 5')).not.toContainText(
    /is on shift then|is asleep then/,
  )
})

async function dueOf(lessonId: string) {
  const [row] = await sql<{ due_at: Date }>(
    `select due_at from lesson_deadlines where lesson_id = $1 and student_id = $2`,
    [lessonId, may.id],
  )
  return row?.due_at.toISOString() ?? null
}
