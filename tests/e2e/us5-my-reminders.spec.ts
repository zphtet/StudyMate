import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent } from './fixtures/courses'
import { sql } from './fixtures/db'
import { seedRule } from './fixtures/notifications'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 006 User Story 5 – Student controls their own reminders (11-Profile.png's Study rows; My
// reminders has no screenshot). Zin (Admin, Yangon) has May (Tokyo) linked. When a personal reminder
// arrives is tested in src/server/notifications/dispatch.test.ts (research R16).

let zin: TestUser
let may: TestUser

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
})

const row = (page: Page, label: string) =>
  page.getByRole('main').getByRole('button', { name: new RegExp(label) })
const reminder = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })

test('scenario 1: quiet hours 12:00–13:00 show on Me; None brings back the default', async ({
  page,
}) => {
  await signIn(page, may)
  await page.goto('/s/me')
  await expect(row(page, 'Quiet hours')).toContainText('While on shift + sleep')

  await row(page, 'Quiet hours').click()
  await page.getByRole('radio', { name: 'Set times' }).click()
  await page.getByLabel('From').fill('12:00')
  await page.getByLabel('To').fill('13:00')
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(row(page, 'Quiet hours')).toContainText('12:00–13:00 + shift and sleep')

  await row(page, 'Quiet hours').click()
  await page.getByRole('radio', { name: 'None' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(row(page, 'Quiet hours')).toContainText('While on shift + sleep')
})

test('scenario 3: + Reminder adds "Kanji 10 min" at 12:30 every day; its switch turns it off', async ({
  page,
}) => {
  await signIn(page, may)
  await page.goto('/s/me/reminders')
  await expect(page.getByRole('heading', { name: 'My reminders', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Reminder', exact: true }).click()
  await page.getByLabel('Message').fill('Kanji 10 min')
  await page.getByLabel('Time').fill('12:30')
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(reminder(page, 'Kanji 10 min')).toContainText('12:30 · Every day')
  await reminder(page, 'Kanji 10 min').getByRole('switch', { name: 'Kanji 10 min' }).click()
  await expect
    .poll(async () => {
      const [rule] = await sql<{ enabled: boolean }>(
        `select enabled from notification_rules where owner_id = $1`,
        [may.id],
      )
      return rule?.enabled
    })
    .toBe(false)
})

test('scenarios 2 and 4: Zin’s rules are read-only, and Me counts what is on', async ({ page }) => {
  await seedRule({
    ownerId: zin.id,
    studentId: may.id,
    trigger: 'daily',
    config: { time: '20:00', days: [1, 2, 3, 4, 5] },
    message: 'Time for today’s lesson.',
  })
  await seedRule({
    ownerId: zin.id,
    studentId: null,
    trigger: 'streak_risk',
    config: { time: '21:30' },
    message: 'Keep your streak.',
  })
  await seedRule({
    ownerId: may.id,
    studentId: may.id,
    trigger: 'daily',
    config: { time: '12:30', days: [1, 2, 3, 4, 5, 6, 7] },
    message: 'Kanji 10 min',
  })

  await signIn(page, may)
  await page.goto('/s/me')
  await expect(row(page, 'My reminders')).toContainText('3 on')

  await row(page, 'My reminders').click()
  await expect(page).toHaveURL(/\/s\/me\/reminders$/)
  await expect(page.getByRole('heading', { name: 'From Zin' })).toBeVisible()
  const daily = reminder(page, 'Daily study reminder')
  await expect(daily).toContainText('20:00 · Mon–Fri')
  await expect(daily).toContainText('Set by Zin')
  await expect(daily.getByRole('switch')).toHaveCount(0)
  await expect(daily.getByRole('button')).toHaveCount(0)
  await expect(reminder(page, 'Streak at risk')).toContainText('Set by Zin')
  await expectNoSeriousA11yViolations(page)
})

test('Admin: the quiet hours row on Me reads Off', async ({ page }) => {
  await signIn(page, zin)
  await page.goto('/a/me')
  await expect(row(page, 'Quiet hours')).toContainText('Off')
  await expect(row(page, 'My reminders')).toHaveCount(0)
})

test('access: GET /api/me/reminders without a session is 401', async ({ request }) => {
  expect((await request.get('/api/me/reminders')).status()).toBe(401)
})
