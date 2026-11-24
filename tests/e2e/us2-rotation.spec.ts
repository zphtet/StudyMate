import { expect, test, type Browser, type Page } from '@playwright/test'
import { addCalendarDays, mondayOf, todayIn, zonedToUtc } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent, seedShift, setShiftSettings } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 005 User Story 2 – Repeating rotation, and the Sunday check (FR-009). May studies in Tokyo,
// linked to Zin. Rotations start next Monday, so nothing of today interferes.

const TOKYO = 'Asia/Tokyo'

let admin: TestUser
let may: TestUser
let monday: string

const dayOf = (offset: number) => addCalendarDays(monday, offset)
const cell = (page: Page, date: string) => page.locator(`button[data-date="${date}"]`)

async function openShifts(page: Page, date: string) {
  await page.goto(`/s/shifts?month=${date.slice(0, 7)}&day=${date}`)
  await expect(page.getByRole('heading', { name: 'Shifts', exact: true })).toBeVisible()
}

/** Builds the pattern with the + buttons (removing any existing tiles first) and saves it. */
async function saveRotation(page: Page, letters: string) {
  await page.goto('/s/shifts/rotation')
  await expect(page.getByRole('heading', { name: 'My rotation' })).toBeVisible()
  const tiles = page.getByRole('button', { name: /^Day \d+: / })
  while ((await tiles.count()) > 0) await tiles.first().click()
  const add = { D: '+ Day', E: '+ Evening', N: '+ Night', O: '+ Off' } as const
  for (const letter of letters) {
    await page.getByRole('button', { name: add[letter as keyof typeof add], exact: true }).click()
  }
  await page.getByLabel('Starts on').fill(monday)
  await page.getByRole('button', { name: 'Save rotation' }).click()
  await expect(page).toHaveURL(/\/s\/shifts\?/)
}

async function rows() {
  return sql<{ type: string; start: string; overridden: boolean; generated: boolean }>(
    `select type, to_char(start_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as start,
            overridden, pattern_id is not null as generated
       from shifts where student_id = $1 order by start_at`,
    [may.id],
  )
}

async function signedIn(browser: Browser, user: TestUser, clock?: Date) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, user)
  if (clock) await page.clock.setFixedTime(clock)
  return { context, page }
}

test.beforeEach(async ({ page }) => {
  admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: TOKYO })
  await linkStudent(may.id, admin.id)
  monday = addCalendarDays(mondayOf(todayIn(TOKYO)), 7)
  await signIn(page, may)
})

test('scenario 1: a rotation fills 8 weeks ahead, Nights with sleep', async ({ page }) => {
  // Saving writes ~57 rows in one transaction; over the remote dev database that can take 20 s+.
  test.setTimeout(90_000)
  await openShifts(page, monday)
  await page.getByRole('link', { name: /My rotation/ }).click()
  await expect(page.getByLabel('Starts on')).toHaveValue(monday)
  for (const name of ['+ Day', '+ Day', '+ Day', '+ Off', '+ Night', '+ Night', '+ Off', '+ Off']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await expect(
    page.getByRole('region', { name: 'Next 14 days' }).getByRole('listitem'),
  ).toHaveCount(14)
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('button', { name: 'Save rotation' }).click()
  await expect(page).toHaveURL(/\/s\/shifts\?/, { timeout: 45_000 })

  await expect(cell(page, monday).getByTestId('shift-chip')).toHaveText('9–18')
  await expect(page.getByRole('link', { name: /My rotation/ })).toContainText('DDDONNOO')
  const generated = await rows()
  expect(generated.every((r) => r.generated)).toBe(true)
  expect(generated[0].start).toBe(`${monday} 09:00`)
  const [{ until }] = await sql<{ until: string }>(
    `select generated_until::text as until from shift_patterns where student_id = $1 and active`,
    [may.id],
  )
  expect(until).toBe(addCalendarDays(todayIn(TOKYO), 56))
  const [{ nights, slept }] = await sql<{ nights: number; slept: number }>(
    `select count(*)::int as nights, count(*) filter (where sleep_minutes = 480)::int as slept
       from shifts where student_id = $1 and type = 'night'`,
    [may.id],
  )
  // DDDONNOO: days 5 and 6 of each 8-day cycle, from Monday through the last generated day.
  let expected = 0
  for (let i = 0; addCalendarDays(monday, i) <= until; i++)
    if (i % 8 === 4 || i % 8 === 5) expected++
  expect(nights).toBe(expected)
  expect(slept).toBe(nights)
})

test('scenarios 2 and 4: an edited day survives a change; a deleted day stays Off; delete removes the rest', async ({
  page,
  request,
}) => {
  // Many writes and page loads against the hosted dev database (as in us3-day).
  test.setTimeout(120_000)
  await saveRotation(page, 'DDOO')
  // Edit Monday's generated Day to 09:00–19:00.
  await openShifts(page, monday)
  await page.getByRole('link', { name: /Day shift/ }).click()
  await page.getByLabel('Ends').fill('19:00')
  await page.getByRole('button', { name: 'Save shift' }).click()
  await expect(cell(page, monday).getByTestId('shift-chip')).toHaveText('9–19')

  await saveRotation(page, 'EEOO')
  await openShifts(page, monday)
  await expect(cell(page, monday).getByTestId('shift-chip')).toHaveText('9–19')
  // Tuesday can be in the next month (Mon 30 Nov → Tue 1 Dec); the grid's spill-over days show no chips.
  await openShifts(page, dayOf(1))
  await expect(cell(page, dayOf(1)).getByTestId('shift-chip')).toHaveText('14–23')

  // Delete Tuesday's generated Evening: the day becomes Off, also after the daily top-up.
  await openShifts(page, dayOf(1))
  await page.getByRole('link', { name: /Evening shift/ }).click()
  await page.getByRole('button', { name: 'Delete shift' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText("This day becomes Off; your rotation won't fill it again.")
  await dialog.getByRole('button', { name: 'Delete shift' }).click()
  await expect(cell(page, dayOf(1)).getByTestId('shift-chip')).toHaveText('Off')
  const cron = await request.get('/api/cron/rotations', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  expect(cron.status()).toBe(200)
  await openShifts(page, dayOf(1))
  await expect(cell(page, dayOf(1)).getByTestId('shift-chip')).toHaveText('Off')

  // Delete the rotation: its untouched future shifts go; the edited and deleted days stay.
  await page.goto('/s/shifts/rotation')
  await page.getByRole('button', { name: 'Delete rotation' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete rotation' }).click()
  // The rotation editor's own URL starts with /s/shifts too: wait for the Shifts tab itself.
  await expect(page).toHaveURL(/\/s\/shifts$/)
  await expect(page.getByRole('link', { name: /My rotation/ })).toContainText('Set up a rotation')
  expect((await rows()).map((r) => [r.start.slice(0, 10), r.type, r.overridden])).toEqual([
    [monday, 'day', true],
    [dayOf(1), 'off', true],
  ])
})

test('a day with the student’s own shift is kept, and saving says so', async ({ page }) => {
  await seedShift(may.id, {
    type: 'night',
    startAt: zonedToUtc(dayOf(2), '22:00', TOKYO).toISOString(),
    endAt: zonedToUtc(dayOf(3), '07:00', TOKYO).toISOString(),
  })
  await saveRotation(page, 'D')
  await expect(page.getByText('Kept your own shifts on 1 day.')).toBeVisible()
  const wednesday = (await rows()).filter((r) => r.start.startsWith(dayOf(2)))
  expect(wednesday.map((r) => [r.type, r.generated])).toEqual([['night', false]])
})

test('Repeat: My rotation opens the rotation editor with that day and type, without saving', async ({
  page,
}) => {
  await page.goto(`/s/shifts/new?date=${dayOf(2)}`)
  await page.getByRole('radio', { name: 'Custom', exact: true }).click()
  await expect(page.getByRole('radio', { name: /My rotation/ })).toBeDisabled()
  await page.getByRole('radio', { name: 'Night', exact: true }).click()
  await page.getByRole('radio', { name: /My rotation/ }).check()
  await page.getByRole('button', { name: 'Save shift' }).click()
  await expect(page).toHaveURL(`/s/shifts/rotation?start=${dayOf(2)}&type=N`)
  await expect(page.getByLabel('Starts on')).toHaveValue(dayOf(2))
  await expect(page.getByRole('button', { name: /^Day \d+: / })).toHaveText(['N'])
  expect(await rows()).toEqual([])
})

test('scenario 3: the Sunday check shows from 18:00 until Confirm, on every device; Edit opens next Monday', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  // This week's Sunday 19:00 in Tokyo; the server's "next Monday" is the same week as the device's.
  const sunday = zonedToUtc(addCalendarDays(monday, -1), '19:00', TOKYO)
  await seedShift(may.id, {
    type: 'day',
    startAt: zonedToUtc(dayOf(1), '09:00', TOKYO).toISOString(),
    endAt: zonedToUtc(dayOf(1), '18:00', TOKYO).toISOString(),
  })
  const card = (p: Page) => p.getByRole('region', { name: "Next week's shifts — correct?" })
  await page.clock.setFixedTime(sunday)

  await page.goto('/s/today')
  await expect(card(page)).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await openShifts(page, monday)
  await expect(card(page)).toBeVisible()
  await card(page).getByRole('button', { name: 'Confirm' }).click()
  await expect(card(page)).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Shifts', exact: true })).toBeVisible()
  await expect(card(page)).toBeHidden()

  const other = await signedIn(browser, may, sunday)
  await other.page.goto('/s/today')
  await other.page.waitForResponse('**/api/shifts/today')
  await expect(card(other.page)).toBeHidden()
  await other.context.close()

  // Edit also dismisses it, and opens next Monday.
  await setShiftSettings(may.id, { confirmedWeek: null })
  await page.goto('/s/today')
  await card(page).getByRole('button', { name: 'Edit' }).click()
  await expect(page).toHaveURL(`/s/shifts?month=${monday.slice(0, 7)}&day=${monday}`)
  await expect(card(page)).toBeHidden()
  await expect
    .poll(async () => {
      const [row] = await sql<{ week: string | null }>(
        `select shifts_confirmed_week::text as week from profiles where id = $1`,
        [may.id],
      )
      return row.week
    })
    .toBe(monday)

  // A student without shifts has nothing to check.
  const dee = await createConfirmedUser({ role: 'student', displayName: 'Dee', timezone: TOKYO })
  await linkStudent(dee.id, admin.id)
  const empty = await signedIn(browser, dee, sunday)
  await empty.page.goto('/s/today')
  await empty.page.waitForResponse('**/api/shifts/today')
  await expect(card(empty.page)).toBeHidden()
  await empty.context.close()
})

test('the rotation top-up refuses calls without the cron secret', async ({ request }) => {
  expect((await request.get('/api/cron/rotations')).status()).toBe(401)
  const wrong = await request.get('/api/cron/rotations', {
    headers: { authorization: 'Bearer not-the-secret' },
  })
  expect(wrong.status()).toBe(401)
})
