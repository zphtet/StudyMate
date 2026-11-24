import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse, seedShift } from './fixtures/courses'
import { sql } from './fixtures/db'
import { runDispatch, seedMessage } from './fixtures/notifications'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 006 User Story 3 – Admin sends or schedules a one-off message (25-AdminMessage.png, and the
// Scheduled messages on 24-AdminNotify.png). Zin (Admin, Yangon +06:30) and May (Tokyo +09:00, no
// daylight saving) are linked. The browser's clock is tomorrow 16:00 Tokyo, so 15:00 has passed,
// 18:00 is ahead and the server agrees the picked times are in the future. When a message is
// delivered is tested in src/server/notifications/dispatch.test.ts (research R16).

let zin: TestUser
let may: TestUser
let lessonId: string

/** Tomorrow's date in Tokyo, `YYYY-MM-DD`. */
function tomorrowInTokyo() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
const day = tomorrowInTokyo()
const tokyo = (time: string) => new Date(`${day}T${time}:00+09:00`)

test.beforeEach(async ({ page }) => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
  const course = await seedCourse({
    ownerId: zin.id,
    title: 'JLPT N4',
    lessons: [{ title: 'Particle で for means', status: 'published' }],
  })
  lessonId = course.lessonIds[0]
  await assignCourse(course.courseId, may.id, zin.id)
  await page.clock.install({ time: tokyo('16:00') })
})

const composer = (page: Page) => page.goto(`/a/alerts/messages/new?student=${may.id}`)
const tile = (page: Page, name: RegExp) => page.getByRole('radio', { name })

test('independent test: a template, a lesson and 18:00 May’s time appear under Scheduled messages', async ({
  page,
}) => {
  await signIn(page, zin)
  await composer(page)
  await expect(page.getByRole('heading', { name: 'New message' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'May · Tokyo' })).toBeChecked()

  await page.getByRole('button', { name: "Today's lesson" }).click()
  await expect(page.getByLabel('Message', { exact: true })).not.toBeEmpty()
  await page.getByLabel('Opens').selectOption({ label: 'Particle で for means' })
  await expect(page.getByText('Particle で for means')).toBeVisible()
  await tile(page, /^18:00/).check()
  await expect(page.getByText("18:00 May's time (Tokyo) · 15:30 your time (Yangon)")).toBeVisible()
  await expect(page.getByText('May is free then, a good study time')).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Schedule · Today, 18:00' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/alerts\\?student=${may.id}`))
  await expect(page.getByRole('heading', { name: 'Scheduled messages · 1' })).toBeVisible()
  const card = page.getByRole('article').filter({ hasText: "Today 18:00 May's time" })
  await expect(card).toContainText('15:30 yours · to May')
  await expect(card.getByRole('link', { name: 'Edit' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Cancel send' })).toBeVisible()
  const [row] = await sql<{ lesson_id: string }>(
    `select lesson_id from scheduled_messages where admin_id = $1`,
    [zin.id],
  )
  expect(row.lesson_id).toBe(lessonId)
})

test('scenario 3: 15:00 has passed, so it reads tomorrow', async ({ page }) => {
  await signIn(page, zin)
  await composer(page)
  await expect(tile(page, /^15:00/)).toHaveAccessibleName(/tomorrow/)
  await expect(tile(page, /^18:00/)).toHaveAccessibleName(/today/)
})

test('scenario 2: the clock switch flips the tiles to Zin’s own time', async ({ page }) => {
  await signIn(page, zin)
  await composer(page)
  await page.getByRole('radio', { name: 'My time · Yangon' }).check()
  // 16:00 Tokyo is 13:30 Yangon: 15:00 is still ahead in Yangon.
  await expect(tile(page, /^15:00/)).toHaveAccessibleName(/today/)
  await tile(page, /^18:00/).check()
  await expect(page.getByText("20:30 May's time (Tokyo) · 18:00 your time (Yangon)")).toBeVisible()
})

test('scenario 4: a time inside a shift warns, and one tap moves it to the next free time', async ({
  page,
}) => {
  await seedShift(may.id, {
    type: 'custom',
    startAt: tokyo('17:00').toISOString(),
    endAt: tokyo('21:00').toISOString(),
  })
  await signIn(page, zin)
  await composer(page)
  await tile(page, /^18:00/).check()
  await expect(page.getByText('May is on shift then.')).toBeVisible()
  await page.getByRole('button', { name: 'Send at 21:00 instead' }).click()
  await expect(page.getByText('May is free then, a good study time')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Schedule · Today, 21:00' })).toBeVisible()
})

test('urgent: the switch is saved on the message', async ({ page }) => {
  await signIn(page, zin)
  await composer(page)
  await page.getByLabel('Message', { exact: true }).fill('Shift swap tonight?')
  await tile(page, /^22:00/).check()
  await page.getByRole('switch', { name: 'Urgent' }).click()
  await page.getByRole('button', { name: /^Schedule/ }).click()
  await expect(page.getByRole('heading', { name: 'Scheduled messages · 1' })).toBeVisible()
  const [row] = await sql<{ urgent: boolean }>(
    `select urgent from scheduled_messages where admin_id = $1`,
    [zin.id],
  )
  expect(row.urgent).toBe(true)
})

test('Cancel send with confirm moves the card to This week, marked Cancelled', async ({ page }) => {
  await seedMessage({
    adminId: zin.id,
    studentIds: [may.id],
    body: 'See you at 18:00',
    deliverAt: tokyo('18:00').toISOString(),
  })
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  await page.getByRole('button', { name: 'Cancel send' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel send' }).click()
  await expect(page.getByRole('heading', { name: /Scheduled messages/ })).toHaveCount(0)
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByRole('article').filter({ hasText: 'See you at 18:00' })).toContainText(
    'Cancelled',
  )
})

test('read status: after delivery and May reading it, the card shows Read', async ({ page }) => {
  const messageId = await seedMessage({
    adminId: zin.id,
    studentIds: [may.id],
    body: 'Great job this week!',
    deliverAt: new Date(Date.now() - 60_000).toISOString(),
  })
  await sql(`update profiles set waking_start = '00:00', waking_end = '23:59' where id = $1`, [
    may.id,
  ])
  await runDispatch(page.request)
  await sql(
    `update notifications set read_at = now() where source_type = 'message' and source_id = $1`,
    [messageId],
  )
  await page.clock.install({ time: new Date() })
  await signIn(page, zin)
  await page.goto(`/a/alerts?student=${may.id}`)
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByRole('article').filter({ hasText: 'Great job this week!' })).toContainText(
    'May · Read',
  )
})

test('scenario 7: Send a nudge on Students preselects the student', async ({ page }) => {
  await signIn(page, zin)
  await page.getByRole('link', { name: 'Send a nudge to May' }).click()
  await expect(page).toHaveURL(new RegExp(`/a/alerts/messages/new\\?student=${may.id}`))
  await expect(page.getByRole('checkbox', { name: 'May · Tokyo' })).toBeChecked()
})

test('scenario 8: Make it a rule instead opens a Daily rule with the text', async ({ page }) => {
  await signIn(page, zin)
  await composer(page)
  await page.getByLabel('Message', { exact: true }).fill('Ten minutes of kanji, {name}?')
  await page.getByRole('link', { name: 'Need it every day? Make it a rule instead' }).click()
  await expect(page.getByRole('heading', { name: 'New rule' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Daily time', exact: true })).toBeChecked()
  // Next keeps the composer hidden in the DOM for Back, so ask for the visible textbox only.
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'Ten minutes of kanji, {name}?',
  )
  await expect(page.getByLabel('Applies to')).toHaveValue(may.id)
})

test('access: a student gets 403 from availability and a message', async ({ page }) => {
  const messageId = await seedMessage({
    adminId: zin.id,
    studentIds: [may.id],
    body: 'Hi',
    deliverAt: tokyo('18:00').toISOString(),
  })
  await signIn(page, may)
  const at = encodeURIComponent(tokyo('18:00').toISOString())
  expect(
    (await page.request.get(`/api/alerts/availability?students=${may.id}&at=${at}`)).status(),
  ).toBe(403)
  expect((await page.request.get(`/api/alerts/messages/${messageId}`)).status()).toBe(403)
})
