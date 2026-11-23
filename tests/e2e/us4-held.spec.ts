import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { linkStudent, seedShift, setShiftSettings } from './fixtures/courses'
import { runDispatch, seedMessage, seedNotification } from './fixtures/notifications'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 006 User Story 4 – Nothing arrives while working, asleep or in quiet hours. US4 has no screen
// of its own, so this smoke test (constitution III) takes the held and urgent paths through the real
// dispatch route, the bell and the inbox. Exact times and bundling are tested in
// src/server/notifications/dispatch.test.ts (research R16). May is awake around the clock, so only
// the shift seeded here makes her busy.

let zin: TestUser
let may: TestUser

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: 'Asia/Tokyo' })
  await linkStudent(may.id, zin.id)
  await setShiftSettings(may.id, { wakingStart: '00:00', wakingEnd: '23:59' })
})

test('on shift: a notice waits, an urgent message arrives at once', async ({ page }) => {
  await seedShift(may.id, { type: 'custom', startAt: hoursFromNow(-1), endAt: hoursFromNow(3) })
  // As 004's review records it (recordNotice): pending until the dispatcher delivers it.
  await seedNotification({
    userId: may.id,
    title: 'Particles は vs が: needs redo',
    body: 'Zin asked you to redo your assignment.',
    deliveredAt: null,
  })
  await runDispatch(page.request)

  await signIn(page, may)
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible()
  await page.goto('/s/inbox')
  await expect(page.getByText('Nothing here yet')).toBeVisible()

  await seedMessage({
    adminId: zin.id,
    studentIds: [may.id],
    body: 'May, the test moved to 9:00.',
    deliverAt: new Date().toISOString(),
    urgent: true,
  })
  await runDispatch(page.request)

  await page.goto('/s/today')
  await page.getByRole('link', { name: 'Notifications, 1 unread' }).click()
  await expect(page).toHaveURL(/\/s\/inbox$/)
  await expect(page.getByText('May, the test moved to 9:00.')).toBeVisible()
  await expect(page.getByText(/needs redo/)).toBeHidden()
  await expectNoSeriousA11yViolations(page)
})
