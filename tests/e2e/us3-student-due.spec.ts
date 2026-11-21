import { expect, test, type Page } from '@playwright/test'
import { calendarDaysBetween, startOfLocalDay, todayIn, zonedToUtc } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import {
  assignCourse,
  linkStudent,
  markDone,
  seedCourse,
  setLessonDeadline,
} from './fixtures/courses'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 003 User Story 3 – Student sees what is due and what is late (screens 04-Today, 05-Courses,
// 09-Course; partial per contracts/ui-routes.md). Deadlines are seeded relative to the real clock,
// in the student's own zone, so the chips are the same whenever the suite runs.

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'
const DAY = 86_400_000

let admin: TestUser

/** Calendar date `days` from the student's today. */
function localDate(timeZone: string, days: number) {
  const today = todayIn(timeZone)
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}
const at = (timeZone: string, days: number, time: string) =>
  zonedToUtc(localDate(timeZone, days), time, timeZone).toISOString()
/** Within 24 h and on tomorrow's date: 00:00 tomorrow, or an hour from now late in the evening. */
function tomorrowSoon(timeZone: string) {
  const midnight = startOfLocalDay(localDate(timeZone, 1), timeZone).getTime()
  return new Date(Math.max(midnight, Date.now() + 3_600_000)).toISOString()
}
const fmt = (iso: string, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en', { ...options, timeZone }).format(new Date(iso))

async function student(name: string, timezone: string) {
  const user = await createConfirmedUser({ role: 'student', displayName: name, timezone })
  await linkStudent(user.id, admin.id)
  return user
}

const lessonRow = (page: Page, title: string) =>
  page.getByTestId('student-lesson-row').filter({ hasText: title })

test.beforeEach(async () => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
})

test('scenario 1: Today shows Overdue · N then Due today, 5 rows then Show all', async ({
  page,
}) => {
  const may = await student('May', TOKYO)
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    unlockInOrder: false,
    lessons: [
      ...Array.from({ length: 7 }, (_, i) => ({ title: `Late lesson ${i + 1}`, estMinutes: 15 })),
      { title: 'Kanji set 12', estMinutes: 20 },
      { title: 'Not due yet' },
    ],
  })
  await assignCourse(courseId, may.id, admin.id)
  // Late lesson k is k days late; the oldest (7 days) comes first.
  for (let k = 1; k <= 7; k++) {
    await setLessonDeadline(lessonIds[k - 1], may.id, at(TOKYO, -k, '12:00'), admin.id)
  }
  await setLessonDeadline(lessonIds[7], may.id, at(TOKYO, 0, '23:59'), admin.id)
  await setLessonDeadline(lessonIds[8], may.id, at(TOKYO, 9, '12:00'), admin.id)

  await signIn(page, may)
  await page.goto('/s/today')
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), May$/ }),
  ).toBeVisible()
  await expect(page.getByText(/· Tokyo$/)).toBeVisible()

  const overdue = page.getByRole('region', { name: 'Overdue · 7' })
  await expect(overdue.getByRole('link')).toHaveCount(5)
  await expect(overdue.getByRole('link').first()).toContainText('Late lesson 7')
  await expect(overdue.getByRole('link').first()).toContainText('JLPT N4 Grammar · 15 min')
  await expect(overdue.getByRole('link').first()).toContainText('7 days late')
  await overdue.getByRole('button', { name: 'Show all (7)' }).click()
  await expect(overdue.getByRole('link')).toHaveCount(7)
  await expect(overdue.getByRole('link').last()).toContainText('1 day late')

  const dueToday = page.getByRole('region', { name: 'Due today' })
  await expect(dueToday.getByRole('link')).toHaveCount(1)
  await expect(dueToday.getByRole('link')).toContainText('Kanji set 12')
  await expect(dueToday.getByRole('link')).toContainText('by 23:59')
  await expect(page.getByText('Not due yet')).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)

  await dueToday.getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/s/lessons/${lessonIds[7]}$`))
})

test('Today is judged in the student’s zone (Yangon, +06:30)', async ({ page }) => {
  const thant = await student('Thant', YANGON)
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'Kanji N4',
    unlockInOrder: false,
    lessons: [{ title: 'Kanji late' }, { title: 'Kanji tonight' }],
  })
  await assignCourse(courseId, thant.id, admin.id)
  await setLessonDeadline(lessonIds[0], thant.id, at(YANGON, -2, '23:30'), admin.id)
  await setLessonDeadline(lessonIds[1], thant.id, at(YANGON, 0, '23:59'), admin.id)

  await signIn(page, thant)
  await page.goto('/s/today')
  await expect(page.getByText(/· Yangon$/)).toBeVisible()
  const overdue = page.getByRole('region', { name: 'Overdue · 1' })
  await expect(overdue.getByRole('link')).toContainText('2 days late')
  await expect(page.getByRole('region', { name: 'Due today' }).getByRole('link')).toContainText(
    'by 23:59',
  )
})

test('nothing due → "Nothing due today"', async ({ page }) => {
  const may = await student('May', TOKYO)
  const { courseId } = await seedCourse({ ownerId: admin.id, lessons: [{ title: 'Free lesson' }] })
  await assignCourse(courseId, may.id, admin.id)
  await signIn(page, may)
  await page.goto('/s/today')
  await expect(page.getByText('Nothing due today')).toBeVisible()
  await expect(page.getByRole('region', { name: /Overdue/ })).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)
})

test('scenarios 2–3: chips and detail lines on the course screen', async ({ page }) => {
  const may = await student('May', TOKYO)
  const { courseId, lessonIds } = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    lessons: [
      { title: 'Particle を', unlockRule: { type: 'none' } },
      { title: 'Particles は vs が', unlockRule: { type: 'none' } },
      { title: 'Particle の', unlockRule: { type: 'none' } },
      { title: 'Particle で', unlockRule: { type: 'none' } },
      { title: 'Particle と', unlockRule: { type: 'none' } },
      { title: 'Particle や', unlockRule: { type: 'none' } },
      { title: 'Review quiz', estMinutes: 25, unlockRule: { type: 'after_previous' } },
    ],
  })
  await assignCourse(courseId, may.id, admin.id)
  const twoDaysLate = at(TOKYO, -2, '12:00')
  const tomorrow = tomorrowSoon(TOKYO)
  const later = at(TOKYO, 5, '12:00')
  await setLessonDeadline(lessonIds[0], may.id, at(TOKYO, -1, '12:00'), admin.id)
  await markDone(may.id, lessonIds[0])
  await setLessonDeadline(lessonIds[1], may.id, twoDaysLate, admin.id)
  await setLessonDeadline(lessonIds[2], may.id, at(TOKYO, 0, '00:00'), admin.id)
  await setLessonDeadline(lessonIds[3], may.id, at(TOKYO, 0, '23:59'), admin.id)
  await setLessonDeadline(lessonIds[4], may.id, tomorrow, admin.id)
  await setLessonDeadline(lessonIds[5], may.id, later, admin.id)

  await signIn(page, may)
  await page.goto(`/s/courses/${courseId}`)

  await expect(lessonRow(page, 'Particle を')).toContainText('Done')
  const late = lessonRow(page, 'Particles は vs が')
  await expect(late).toContainText('2 days late')
  await expect(late).toContainText(
    `15 min · was due ${fmt(twoDaysLate, TOKYO, { weekday: 'short', day: 'numeric', month: 'short' })}`,
  )
  await expect(lessonRow(page, 'Particle の')).toContainText('Overdue')
  const tonight = lessonRow(page, 'Particle で')
  await expect(tonight).toContainText('Due today')
  await expect(tonight).toContainText('15 min · 23:59 tonight')
  const soon = lessonRow(page, 'Particle と')
  await expect(soon).toContainText('Due tomorrow')
  await expect(soon).toContainText(
    `15 min · ${fmt(tomorrow, TOKYO, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`,
  )
  await expect(lessonRow(page, 'Particle や')).toContainText(
    `Due ${fmt(later, TOKYO, { day: 'numeric', month: 'short' })}`,
  )
  const quiz = lessonRow(page, 'Review quiz')
  await expect(quiz).toContainText('Locked')
  await expect(quiz).toContainText('25 min · unlocks after 6')
  // Sanity check on the seeded "tomorrow": within 24 h and one calendar day ahead in Tokyo.
  expect(calendarDaysBetween(new Date(), new Date(tomorrow), TOKYO)).toBe(1)
  await expectNoSeriousA11yViolations(page)
})

test('scenario 4: "finish by" shows the student’s course deadline, and only when there is one', async ({
  page,
}) => {
  const may = await student('May', TOKYO)
  const due = at(TOKYO, 40, '23:59')
  const withDeadline = await seedCourse({
    ownerId: admin.id,
    title: 'With deadline',
    targetDate: '2099-01-01',
    lessons: [{ title: 'One' }],
  })
  const without = await seedCourse({
    ownerId: admin.id,
    title: 'Without deadline',
    targetDate: '2099-01-01',
    lessons: [{ title: 'One' }],
  })
  await assignCourse(withDeadline.courseId, may.id, admin.id, { dueAt: due })
  await assignCourse(without.courseId, may.id, admin.id)

  await signIn(page, may)
  await page.goto(`/s/courses/${withDeadline.courseId}`)
  await expect(
    page.getByText(
      `Assigned by Zin · finish by ${fmt(due, TOKYO, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ),
  ).toBeVisible()

  await page.goto(`/s/courses/${without.courseId}`)
  await expect(page.getByText('Assigned by Zin', { exact: true })).toBeVisible()
  await expect(page.getByText(/finish by/)).toHaveCount(0)
})

test('scenario 5: Courses cards show "due {date} · N overdue" or "no deadline"', async ({
  page,
}) => {
  const may = await student('May', TOKYO)
  const due = at(TOKYO, 40, '23:59')
  const grammar = await seedCourse({
    ownerId: admin.id,
    title: 'JLPT N4 Grammar',
    lessons: [{ title: 'Late one' }, { title: 'Fine one' }],
  })
  const listening = await seedCourse({
    ownerId: admin.id,
    title: 'Listening Practice',
    lessons: [{ title: 'Track 1' }],
  })
  await assignCourse(grammar.courseId, may.id, admin.id, { dueAt: due })
  await assignCourse(listening.courseId, may.id, admin.id)
  await setLessonDeadline(grammar.lessonIds[0], may.id, at(TOKYO, -1, '12:00'), admin.id)

  await signIn(page, may)
  await page.goto('/s/courses')
  const grammarCard = page.getByRole('link', { name: /JLPT N4 Grammar/ })
  await expect(grammarCard).toContainText(
    `2 lessons · due ${fmt(due, TOKYO, { day: 'numeric', month: 'short' })} · 1 overdue`,
  )
  await expect(page.getByRole('link', { name: /Listening Practice/ })).toContainText(
    '1 lesson · no deadline',
  )
  await expect(page.getByRole('link', { name: /Listening Practice/ })).not.toContainText('overdue')
  await expectNoSeriousA11yViolations(page)
})
