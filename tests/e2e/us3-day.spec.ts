import { expect, test, type Page } from '@playwright/test'
import { addCalendarDays, mondayOf, todayIn, zonedToUtc } from '../../src/lib/time'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent, seedShift } from './fixtures/courses'
import { sql } from './fixtures/db'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 005 User Story 3 – Day timeline (screens 07-Shifts, 04-Today, 11-Profile). Waking hours are
// the default 08:00–23:00 and sleep starts 30 min after a shift.

const TOKYO = 'Asia/Tokyo'

let may: TestUser

async function student(timezone: string) {
  const admin = await createConfirmedUser({ role: 'admin', displayName: 'Zin' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone })
  await linkStudent(may.id, admin.id)
}

async function openShifts(page: Page, date: string) {
  await page.goto(`/s/shifts?month=${date.slice(0, 7)}&day=${date}`)
  await expect(page.getByRole('heading', { name: 'Shifts', exact: true })).toBeVisible()
}

const dayList = (page: Page) =>
  page.getByRole('list', { name: /^Shifts on / }).getByRole('listitem')

test('scenario 1: the selected day shows the bar and the list of shift, sleep and free time', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await student(TOKYO)
  // Next week's Friday 22:00 → Saturday 07:00, with 8 h sleep (quickstart 4).
  const friday = addCalendarDays(mondayOf(todayIn(TOKYO)), 11)
  const saturday = addCalendarDays(friday, 1)
  await seedShift(may.id, {
    type: 'night',
    startAt: zonedToUtc(friday, '22:00', TOKYO).toISOString(),
    endAt: zonedToUtc(saturday, '07:00', TOKYO).toISOString(),
    sleepMinutes: 480,
  })
  await signIn(page, may)
  await openShifts(page, saturday)

  await expect(page.getByTestId('day-bar')).toHaveAccessibleName(
    'Shift 00:00–07:00, Sleep 07:00–15:30, Free 15:30–23:00, Sleep 23:00–24:00',
  )
  await expect(dayList(page)).toHaveText([
    /^00:00–07:00\s*Night shift \(from Fri\)$/,
    /^07:30–15:30\s*Sleep, auto 8 h$/,
    /^15:30–23:00\s*Free to study$/,
  ])
  await expectNoSeriousA11yViolations(page)

  // Another day comes from the same month read: no request.
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push(r.url())
  })
  await page.locator(`button[data-date="${friday}"]`).click()
  await expect(dayList(page)).toHaveText([
    /^08:00–22:00\s*Free to study$/,
    /^22:00 → Sat 07:00\s*Night shift$/,
  ])
  expect(requests).toEqual([])
})

/**
 * A zone where it is about 12:00 now, so "today" has room before and after (Etc/GMT-X is UTC+X).
 * Hours from now are then whole local hours of today.
 */
function middayZone() {
  const offset = 12 - new Date().getUTCHours()
  return offset >= 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`
}

test('Today’s banner: a night shift tonight, a running shift, another shift later; Me counts the week', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const zone = middayZone()
  await student(zone)
  const today = todayIn(zone)
  const at = (time: string, days = 0) => zonedToUtc(addCalendarDays(today, days), time, zone)
  const seed = async (type: 'day' | 'night' | 'custom', start: Date, end: Date) => {
    await sql(`delete from shifts where student_id = $1`, [may.id])
    await seedShift(may.id, { type, startAt: start.toISOString(), endAt: end.toISOString() })
  }
  const banner = page.getByRole('region', { name: 'Your shift today' })
  await signIn(page, may)

  await page.goto('/s/today')
  await expect(page.getByRole('heading', { name: /May/ })).toBeVisible()
  await expect(banner).toBeHidden()

  await seed('night', at('20:00'), at('04:00', 1))
  await page.goto('/s/today')
  await expect(banner).toContainText('Night shift tonight · 20:00–04:00')
  await expect(banner).toContainText(/Good window to study now: about \d+ h free/)
  await expectNoSeriousA11yViolations(page)

  await seed('day', at('09:00'), at('18:00'))
  await page.goto('/s/today')
  await expect(banner).toContainText('On shift until 18:00')
  await expect(banner).toContainText('Free again at 18:00')

  await seed('custom', at('15:00'), at('18:00'))
  await page.goto('/s/today')
  await expect(banner).toContainText('Custom shift today · 15:00–18:00')

  await page.goto('/s/me')
  const row = page.getByRole('link', { name: /Shift calendar/ })
  await expect(row).toContainText('1 shift this week')
  await row.click()
  await expect(page.getByRole('heading', { name: 'Shifts', exact: true })).toBeVisible()
})
