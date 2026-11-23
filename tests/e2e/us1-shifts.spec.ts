import { expect, test, type Page } from '@playwright/test'
import { addCalendarDays, mondayOf, todayIn } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 005 User Story 1 – Student adds a shift, including overnight (screens 07-Shifts,
// 08-ShiftEdit). May studies in Tokyo and is linked to Zin. Her shifts are next week, so "today"
// never interferes: Fri 22:00 → Sat 07:00 is the night shift of the scenarios.

const TOKYO = 'Asia/Tokyo'

let admin: TestUser
let may: TestUser
let monday: string

const dayOf = (offset: number) => addCalendarDays(monday, offset)
const FRI = 4
const SAT = 5
const SUN = 6

const cell = (page: Page, date: string) => page.locator(`button[data-date="${date}"]`)
const chip = (page: Page, date: string, text: string) =>
  cell(page, date).getByTestId('shift-chip').filter({ hasText: text })

/** A shift type tile (exact: "Day" must not match "Just this day"). */
const typeTile = (page: Page, name: string) => page.getByRole('radio', { name, exact: true })

async function openShifts(page: Page, date: string) {
  await page.goto(`/s/shifts?month=${date.slice(0, 7)}&day=${date}`)
  await expect(page.getByRole('heading', { name: 'Shifts', exact: true })).toBeVisible()
}

async function countShifts() {
  const [row] = await sql<{ n: number }>(
    `select count(*)::int as n from shifts where student_id = $1`,
    [may.id],
  )
  return row.n
}

async function addNight(page: Page, date: string) {
  await openShifts(page, date)
  // SC-001: three taps from the Shifts tab.
  await page.getByRole('link', { name: 'Add shift' }).click()
  await typeTile(page, 'Night').click()
  await page.getByRole('button', { name: 'Save shift' }).click()
  await expect(page).toHaveURL(/\/s\/shifts\?/)
}

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: TOKYO })
  await linkStudent(may.id, admin.id)
  monday = addCalendarDays(mondayOf(todayIn(TOKYO)), 7)
  await signIn(page, may)
})

test('scenario 1: each preset fills its times; Custom keeps them; Off hides them', async ({
  page,
}) => {
  await page.goto(`/s/shifts/new?date=${dayOf(FRI)}`)
  const starts = page.getByLabel('Starts')
  const ends = page.getByLabel('Ends')
  for (const [type, start, end] of [
    ['Day', '09:00', '18:00'],
    ['Evening', '14:00', '23:00'],
    ['Night', '22:00', '07:00'],
  ]) {
    await typeTile(page, type).click()
    await expect(typeTile(page, type)).toBeChecked()
    await expect(starts).toHaveValue(start)
    await expect(ends).toHaveValue(end)
  }
  await typeTile(page, 'Custom').click()
  await expect(starts).toHaveValue('22:00')
  await expect(ends).toHaveValue('07:00')
  await typeTile(page, 'Off').click()
  await expect(starts).toBeHidden()
  await expect(page.getByRole('checkbox', { name: /Block sleep/ })).toBeHidden()
  await expectNoSeriousA11yViolations(page)
})

test('scenarios 2 and 4: Night ends the next day, 9 h, and blocks 8 h of sleep by default', async ({
  page,
}) => {
  await page.goto(`/s/shifts/new?date=${dayOf(FRI)}`)
  await typeTile(page, 'Night').click()
  await expect(page.getByText('+1 day')).toBeVisible()
  await expect(page.getByText('9 h · crosses midnight, ends the next morning')).toBeVisible()
  const sleep = page.getByRole('checkbox', { name: /Block sleep after this shift/ })
  await expect(sleep).toBeChecked()
  await expect(page.getByText(/No reminders until 15:30 Sat \(8 h\)/)).toBeVisible()
  await typeTile(page, 'Day').click()
  await expect(page.getByText('+1 day')).toBeHidden()
  await expect(page.getByText('9 h', { exact: true })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test('scenario 3 and SC-001: a night shift in three taps shows "22→" and "→07" joined, one row', async ({
  page,
}) => {
  await addNight(page, dayOf(FRI))
  const start = chip(page, dayOf(FRI), '22→')
  const end = chip(page, dayOf(SAT), '→07')
  await expect(start).toBeVisible()
  await expect(end).toBeVisible()
  // Joined: the Friday chip runs to the edge of its cell and the Saturday chip starts at its edge.
  const [a, b] = [await start.boundingBox(), await end.boundingBox()]
  expect(b!.x - (a!.x + a!.width)).toBeLessThanOrEqual(1)
  await expect(cell(page, dayOf(FRI))).toHaveAccessibleName(/Night shift 22:00 to Saturday 07:00/)
  expect(await countShifts()).toBe(1)

  // A Sunday night joins Monday across the row break.
  await addNight(page, dayOf(SUN))
  await openShifts(page, dayOf(SUN + 1))
  await expect(chip(page, dayOf(SUN + 1), '→07')).toHaveAttribute('data-part', 'end')
  await openShifts(page, dayOf(SUN))
  await expect(chip(page, dayOf(SUN), '22→')).toHaveAttribute('data-part', 'start')
  expect(await countShifts()).toBe(2)
  await expectNoSeriousA11yViolations(page)
})

test('Edge Cases: an overlapping shift is refused with the shift it overlaps', async ({ page }) => {
  await addNight(page, dayOf(FRI))
  await page.goto(`/s/shifts/new?date=${dayOf(SAT)}`)
  await typeTile(page, 'Day').click()
  await page.getByLabel('Starts').fill('06:00')
  await page.getByLabel('Ends').fill('10:00')
  await page.getByRole('button', { name: 'Save shift' }).click()
  // Scoped to the form: Next's route announcer is an alert too.
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'Overlaps your shift Fri 22:00–07:00',
  )
  expect(await countShifts()).toBe(1)
})

test('a shift is edited and deleted from its day', async ({ page }) => {
  await addNight(page, dayOf(FRI))
  await openShifts(page, dayOf(FRI))
  await page.getByRole('link', { name: /Night shift/ }).click()
  await expect(page.getByLabel('Ends')).toHaveValue('07:00')
  await page.getByLabel('Ends').fill('06:00')
  await page.getByRole('button', { name: 'Save shift' }).click()
  await expect(chip(page, dayOf(SAT), '→06')).toBeVisible()
  expect(await countShifts()).toBe(1)

  await page.getByRole('link', { name: /Night shift/ }).click()
  await page.getByRole('button', { name: 'Delete shift' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete shift' }).click()
  await expect(page).toHaveURL(/\/s\/shifts\?/)
  await expect(cell(page, dayOf(FRI)).getByTestId('shift-chip')).toHaveCount(0)
  expect(await countShifts()).toBe(0)
})

test('Shift settings: a new Night time fills the next Night shift', async ({ page }) => {
  await openShifts(page, dayOf(FRI))
  await page.getByRole('button', { name: /Shift settings/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Shift settings' })
  await sheet.getByLabel('Night starts').fill('21:00')
  await sheet.getByLabel('Night ends').fill('06:00')
  await expectNoSeriousA11yViolations(page)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('link', { name: 'Add shift' }).click()
  await typeTile(page, 'Night').click()
  await expect(page.getByLabel('Starts')).toHaveValue('21:00')
  await expect(page.getByLabel('Ends')).toHaveValue('06:00')
})

test('the empty state invites the first shift', async ({ page }) => {
  await openShifts(page, dayOf(FRI))
  await expect(page.getByText('Add your shifts so your admin plans around them.')).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test('roles: an Admin can’t read a student’s shift data or open the Shifts tab', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, admin)
  for (const path of ['/api/shifts', '/api/shifts/settings']) {
    const response = await page.request.get(path)
    expect(response.status()).toBe(403)
    expect((await response.json()).error.code).toBe('forbidden')
  }
  await page.goto('/s/shifts')
  await expect(page).not.toHaveURL(/\/s\/shifts/)
  await context.close()
})
