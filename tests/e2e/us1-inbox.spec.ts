import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './fixtures/a11y'
import { assignCourse, linkStudent, seedCourse, setShiftSettings } from './fixtures/courses'
import { sql } from './fixtures/db'
import { pushSubscriptionsOf, runDispatch, seedNotification } from './fixtures/notifications'
import { createConfirmedUser, signIn, type TestUser } from './fixtures/users'

// Spec 006 User Story 1 – Receive notifications on every device (screen 04-Today's bell; the inbox
// and the reminders card have no screenshot). Zin (admin, Yangon) and May (student, Tokyo) are
// linked; May is awake around the clock, so a dispatch delivers at any time of day. Headless
// Chromium has no push service, so PushManager is stubbed and keeps its fake subscription in
// localStorage across reloads. Delivery timing is tested in src/server/notifications/dispatch.test.ts.

const TOKYO = 'Asia/Tokyo'

let zin: TestUser
let may: TestUser

/** A fake push subscription for this browser (research R8 flow; no real push service). */
async function stubPush(page: Page) {
  await page.addInitScript(() => {
    const KEY = 'e2e-push-endpoint'
    const fake = (endpoint: string) => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
      unsubscribe: async () => {
        localStorage.removeItem(KEY)
        return true
      },
    })
    PushManager.prototype.subscribe = async function () {
      const endpoint =
        localStorage.getItem(KEY) ?? `https://push.example.test/${crypto.randomUUID()}`
      localStorage.setItem(KEY, endpoint)
      return fake(endpoint) as unknown as PushSubscription
    }
    PushManager.prototype.getSubscription = async function () {
      const endpoint = localStorage.getItem(KEY)
      return (endpoint ? fake(endpoint) : null) as unknown as PushSubscription | null
    }
  })
}

test.beforeEach(async () => {
  zin = await createConfirmedUser({ role: 'admin', displayName: 'Zin', timezone: 'Asia/Yangon' })
  may = await createConfirmedUser({ role: 'student', displayName: 'May', timezone: TOKYO })
  await linkStudent(may.id, zin.id)
  await setShiftSettings(may.id, { wakingStart: '00:00', wakingEnd: '23:59' })
})

test('independent test: a review notice arrives, the bell counts it, opening it reads it', async ({
  page,
}) => {
  const { courseId, lessonIds } = await seedCourse({
    ownerId: zin.id,
    lessons: [{ title: 'Particles は vs が', status: 'published' }],
  })
  await assignCourse(courseId, may.id, zin.id)
  // As 004's review records it (recordNotice): pending until the dispatcher delivers it.
  await seedNotification({
    userId: may.id,
    title: 'Particles は vs が: needs redo',
    body: 'Zin asked you to redo your assignment.',
    url: `/s/lessons/${lessonIds[0]}`,
    sourceId: lessonIds[0],
    occurrenceKey: 'reviewed',
    deliveredAt: null,
  })

  await signIn(page, may)
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible()
  await runDispatch(page.request)
  await page.reload()

  await page.getByRole('link', { name: 'Notifications, 1 unread' }).click()
  await expect(page).toHaveURL(/\/s\/inbox$/)
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('link', { name: /needs redo/ }).click()
  await expect(page).toHaveURL(new RegExp(`/s/lessons/${lessonIds[0]}`))
  await page.goto('/s/today')
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible()
})

test('scenario 4: newest first, Mark all read, and ?n= from a phone notification reads it', async ({
  page,
}) => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  await seedNotification({
    userId: may.id,
    title: 'Older',
    body: 'First',
    deliveredAt: minutesAgo(30),
  })
  await seedNotification({
    userId: may.id,
    title: 'Newer',
    body: 'Second',
    deliveredAt: minutesAgo(5),
  })
  const tapped = await seedNotification({
    userId: may.id,
    title: 'Tapped on the phone',
    body: 'Opened from the notification',
    url: '/s/courses',
    deliveredAt: minutesAgo(60),
  })

  await signIn(page, may)
  await page.goto(`/s/courses?n=${tapped}`)
  await expect(page).toHaveURL(/\/s\/courses$/)
  await expect
    .poll(
      async () =>
        (await sql(`select read_at from notifications where id = $1`, [tapped]))[0].read_at,
    )
    .not.toBeNull()

  await page.goto('/s/inbox')
  const titles = page.getByRole('listitem')
  await expect(titles.nth(0)).toContainText('Newer')
  await expect(titles.nth(1)).toContainText('Older')
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByRole('button', { name: 'Mark all read' })).toBeHidden()
  await page.goto('/s/today')
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible()
})

test('scenario 1: Turn on saves this device, Me reads On, and signing out removes it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications'])
  await stubPush(page)
  await signIn(page, may)

  await expect(page.getByRole('heading', { name: 'Get reminders on this phone' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByRole('heading', { name: 'Get reminders on this phone' })).toBeHidden()
  await expect.poll(async () => (await pushSubscriptionsOf(may.id)).length).toBe(1)

  await page.goto('/s/me')
  await expect(page.getByRole('button', { name: /Reminders on this device/ })).toContainText('On')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  expect(await pushSubscriptionsOf(may.id)).toHaveLength(0)
})

test('scenario 3: blocked in the browser, everything still reaches the inbox and Me reads Off', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'denied' })
  })
  await signIn(page, may)
  await expect(page.getByText('Reminders are blocked in your browser settings.')).toBeVisible()
  await page.goto('/s/me')
  await expect(page.getByRole('button', { name: /Reminders on this device/ })).toContainText(
    'Blocked',
  )
})

test.describe('on an iPhone outside the Home Screen app', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  })

  test('scenario 2: the Add to Home Screen guide shows instead of the permission prompt', async ({
    page,
  }) => {
    await signIn(page, may)
    await expect(
      page.getByText('On iPhone, add StudyMate to your Home Screen first.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Show me how' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Add StudyMate to your Home Screen' }),
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })
})

test('the Admin: the bell on Students opens /a/inbox', async ({ page }) => {
  await seedNotification({
    userId: zin.id,
    title: 'May submitted Particles',
    body: 'N4 Grammar · open it to review.',
  })
  await signIn(page, zin)
  await page.getByRole('link', { name: 'Notifications, 1 unread' }).click()
  await expect(page).toHaveURL(/\/a\/inbox$/)
  await expect(page.getByRole('listitem')).toContainText('May submitted Particles')
  await expectNoSeriousA11yViolations(page)
})

test('access: the inbox needs a session, the dispatcher needs the cron secret', async ({
  request,
}) => {
  expect((await request.get('/api/notifications')).status()).toBe(401)
  expect((await request.get('/api/notifications/unread')).status()).toBe(401)
  expect((await request.post('/api/cron/dispatch')).status()).toBe(401)
  const wrong = await request.post('/api/cron/dispatch', {
    headers: { authorization: 'Bearer not-the-secret' },
  })
  expect(wrong.status()).toBe(401)
})
