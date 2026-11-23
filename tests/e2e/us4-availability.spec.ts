import { expect, test, type Page } from '@playwright/test'
import { utcToZoned } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent, seedShift, setShiftSettings } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 005 User Story 4 – Admin sees availability (screens 16-AdminStudents, 22-AdminPlan). Zin
// (admin) is in Yangon; the students are in Tokyo, 2 h 30 ahead, so every time shows both clocks
// ("07:00 · 04:30 yours"). The students are awake 00:00–23:59, so only shifts and sleep blocks
// change their status. Expected times come from status_now() itself.

const TOKYO = 'Asia/Tokyo'
const YANGON = 'Asia/Yangon'
const HOUR = 3_600_000

let zin: TestUser

const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString()
const statusLine = (page: Page, name: string) =>
  page.getByRole('article', { name }).getByTestId('availability')

async function student(name: string) {
  const user = await createConfirmedUser({ role: 'student', displayName: name, timezone: TOKYO })
  await linkStudent(user.id, zin.id)
  await setShiftSettings(user.id, { wakingStart: '00:00', wakingEnd: '23:59' })
  return user
}

/** "07:00 · 04:30 yours" (the Admin's weekday too when their date differs; useTimeBoth). */
async function untilOf(user: TestUser) {
  const [row] = await sql<{ until: Date }>(`select until from status_now($1)`, [user.id])
  const theirs = utcToZoned(row.until, TOKYO)
  const mine = utcToZoned(row.until, YANGON)
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: YANGON }).format(
    row.until,
  )
  return `${theirs.time} · ${theirs.date === mine.date ? mine.time : `${weekday} ${mine.time}`} yours`
}

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: YANGON })
})

test('scenarios 1 and 3: on shift, sleeping, free and no shift info, in both clocks', async ({
  page,
}) => {
  const may = await student('May')
  const bea = await student('Bea')
  const cy = await student('Cy')
  await student('Dee')
  await seedShift(may.id, { type: 'night', startAt: fromNow(-HOUR), endAt: fromNow(5 * HOUR) })
  await seedShift(bea.id, {
    type: 'day',
    startAt: fromNow(-4 * HOUR),
    endAt: fromNow(-HOUR),
    sleepMinutes: 480,
  })
  await seedShift(cy.id, { type: 'day', startAt: fromNow(30 * HOUR), endAt: fromNow(38 * HOUR) })

  await signIn(page, zin)
  await page.goto('/a/students')
  await expect(statusLine(page, 'May')).toHaveText(`On night shift until ${await untilOf(may)}`)
  await expect(statusLine(page, 'Bea')).toHaveText(`Sleeping until ${await untilOf(bea)}`)
  await expect(statusLine(page, 'Cy')).toHaveText('Free now')
  await expect(statusLine(page, 'Dee')).toHaveText('No shift info')
  await expectNoSeriousA11yViolations(page)
})

test('scenario 2: the Plan week draws the shift the student entered', async ({ page }) => {
  const may = await student('May')
  await seedShift(may.id, { type: 'night', startAt: fromNow(-HOUR), endAt: fromNow(2 * HOUR) })
  await signIn(page, zin)
  await page.goto(`/a/plan?student=${may.id}`)
  const today = page.locator('[data-testid="plan-day"][aria-current="date"]')
  await expect(today.getByTestId('day-bar')).toHaveAccessibleName(/Shift \d\d:\d\d–\d\d:\d\d/)
})

test('the line changes by itself when the shown time passes', async ({ page }) => {
  test.setTimeout(90_000)
  const fay = await student('Fay')
  await seedShift(fay.id, { type: 'evening', startAt: fromNow(-HOUR), endAt: fromNow(20_000) })
  await signIn(page, zin)
  await page.goto('/a/students')
  await expect(statusLine(page, 'Fay')).toHaveText(/^On evening shift until /)
  await expect(statusLine(page, 'Fay')).toHaveText('Free now', { timeout: 45_000 })
})
