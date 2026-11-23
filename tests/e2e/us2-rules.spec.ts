import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent } from './fixtures/courses'
import { sql } from './fixtures/db'
import { seedRule } from './fixtures/notifications'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 006 User Story 2 – Admin sets automatic reminders (24-AdminNotify.png, 26-AdminRule.png).
// Zin (Admin, Yangon) has May (Tokyo) and Ken (New York) linked. When a rule fires is tested in
// src/server/notifications/dispatch.test.ts (research R16); here, the Alerts list and the editor.

let zin: TestUser
let may: TestUser
let ken: TestUser

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  ken = await createConfirmedUser({
    role: 'student',
    displayName: 'Ken',
    timezone: 'America/New_York',
  })
  await linkStudent(may.id, zin.id)
  await linkStudent(ken.id, zin.id)
})

/** 003's default set for May (FR-008), as "Add default reminders" creates it. */
async function seedDefaults(studentId: string) {
  const defaults = [
    { trigger: 'daily', config: { time: '20:00', days: [1, 2, 3, 4, 5] } },
    { trigger: 'due_soon', config: { offsets_h: [24, 2] } },
    { trigger: 'overdue', config: { repeat_time: '19:00', max: 3 } },
    { trigger: 'streak_risk', config: { time: '21:30' } },
  ] as const
  for (const { trigger, config } of defaults) {
    await seedRule({
      ownerId: zin.id,
      studentId,
      trigger,
      config: { ...config, preset: 'default' },
      message: 'Time for today’s lesson.',
    })
  }
}

const rule = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

test('scenario 3: May’s default rules are listed with badges and summaries', async ({ page }) => {
  await seedDefaults(may.id)
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)

  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible()
  await expect(rule(page, 'Daily study reminder')).toContainText('DAY')
  await expect(rule(page, 'Daily study reminder')).toContainText('20:00 · Mon–Fri')
  await expect(rule(page, 'Deadline coming up')).toContainText('24 h and 2 h before')
  await expect(rule(page, 'Lesson overdue')).toContainText('At deadline, then daily 19:00 · max 3')
  await expect(rule(page, 'Streak at risk')).toContainText('21:30 if nothing done today')
  await expectNoSeriousA11yViolations(page)
})

test('scenario 6: the note names May and May’s zone; All students has the general note', async ({
  page,
}) => {
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  await expect(page.getByText("Times are in May's time zone (Tokyo).")).toBeVisible()
  await expect(page.getByText(/Nothing is sent while May is on shift/)).toBeVisible()

  await page.getByRole('link', { name: 'All students' }).click()
  await expect(page.getByText("Times are in each student's time zone.")).toBeVisible()
  await expect(page.getByText('No reminders yet. Add a rule or send a message.')).toBeVisible()
})

test('toggle: turning off Streak at risk survives a reload', async ({ page }) => {
  await seedDefaults(may.id)
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)

  const toggle = page.getByRole('switch', { name: 'Streak at risk' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect
    .poll(async () => {
      const rows = await sql<{ enabled: boolean }>(
        `select enabled from notification_rules where student_id = $1 and trigger = 'streak_risk'`,
        [may.id],
      )
      return rows[0].enabled
    })
    .toBe(false)
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Streak at risk' })).not.toBeChecked()
})

test('edit: Daily changed to 20:00 Mon–Fri', async ({ page }) => {
  await seedRule({
    ownerId: zin.id,
    studentId: may.id,
    trigger: 'daily',
    config: { time: '07:30', days: [1, 2, 3, 4, 5, 6, 7] },
    message: 'Morning kanji, {name}.',
  })
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  await expect(rule(page, 'Daily study reminder')).toContainText('07:30 · Every day')

  await page.getByRole('link', { name: /Daily study reminder/ }).click()
  await expect(page.getByRole('heading', { name: 'Edit rule' })).toBeVisible()
  await page.getByLabel('Time', { exact: true }).fill('20:00')
  await page.getByRole('checkbox', { name: 'Sat' }).uncheck()
  await page.getByRole('checkbox', { name: 'Sun' }).uncheck()
  await expect(page.getByText('Morning kanji, May.')).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/a/alerts\\?student=${may.id}`))
  await expect(rule(page, 'Daily study reminder')).toContainText('20:00 · Mon–Fri')
})

test('scenarios 1 and 2: + Rule shows each trigger’s fields; a rule for All students is under every chip', async ({
  page,
}) => {
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  await page.getByRole('link', { name: '+ Rule' }).click()
  await expect(page.getByRole('heading', { name: 'New rule' })).toBeVisible()

  const trigger = (name: string) => page.getByRole('radio', { name, exact: true })
  await trigger('After shift').check()
  await expect(page.getByLabel('Hours after the shift')).toBeVisible()
  await trigger('Due soon').check()
  await expect(page.getByLabel('Hours before', { exact: false }).first()).toBeVisible()
  await trigger('Overdue').check()
  await expect(page.getByText('At the deadline')).toBeVisible()
  await expect(page.getByLabel('Then repeat daily at')).toBeVisible()
  await expect(page.getByLabel('Stop after')).toBeVisible()
  await trigger('Streak at risk').check()
  await expect(page.getByLabel('Time', { exact: true })).toBeVisible()
  await trigger('Inactive days').check()
  await expect(page.getByLabel('Days without study')).toBeVisible()
  await trigger('Weekly summary').check()
  await expect(page.getByLabel('Day', { exact: true })).toBeVisible()
  await trigger('Daily time').check()
  await expect(page.getByRole('checkbox', { name: 'Mon' })).toBeChecked()

  await page.getByLabel('Applies to').selectOption({ label: 'All students' })
  await page.getByLabel('Message').fill('Ten minutes of kanji, {name}?')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page).toHaveURL(/\/a\/alerts\?student=all/)
  await expect(rule(page, 'Daily study reminder')).toBeVisible()
  for (const name of ['May', 'Ken']) {
    await page.getByRole('link', { name, exact: true }).click()
    await expect(rule(page, 'Daily study reminder')).toBeVisible()
  }
})

test('Send test with no device says so', async ({ page }) => {
  await seedDefaults(may.id)
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  await page.getByRole('link', { name: /Streak at risk/ }).click()
  await page.getByRole('button', { name: 'Send test to my phone' }).click()
  await expect(page.getByText('Turn on reminders on this device first')).toBeVisible()
})

test('delete with confirm', async ({ page }) => {
  await seedDefaults(may.id)
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  await page.getByRole('link', { name: /Lesson overdue/ }).click()
  await page.getByRole('button', { name: 'Delete rule' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete rule' }).click()

  await expect(page).toHaveURL(new RegExp(`/a/alerts\\?student=${may.id}`))
  await expect(rule(page, 'Daily study reminder')).toBeVisible()
  await expect(rule(page, 'Lesson overdue')).toHaveCount(0)
})

test('access: a student gets 403 from /api/alerts and never sees /a/alerts', async ({ page }) => {
  await signIn(page, may)
  expect((await page.request.get('/api/alerts?student=all')).status()).toBe(403)
  await page.goto('/a/alerts')
  await expect(page).toHaveURL(/\/s\/today/)
})
