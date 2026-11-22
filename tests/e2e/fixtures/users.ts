import { randomUUID } from 'node:crypto'
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import { supabaseAdmin } from './supabase-admin'

// Fixture users (spec 001 research R5). Every address carries the run prefix so global teardown can
// delete exactly this run's users. Addresses use Resend's test inbox, so nothing reaches a real person.

export type Role = 'student' | 'admin'
export type TestUser = {
  id: string
  email: string
  password: string
  role: Role
  displayName: string
}

export const TEST_PASSWORD = 'Study-mate-2026'

/** Set once per run by tests/e2e/global-setup.ts; workers inherit it. */
export const runId = () => process.env.E2E_RUN ?? 'local'

export const runPrefix = () => `delivered+e2e-${runId()}-`

/** `delivered+e2e-<run>-<name>@resend.dev` */
export const testEmail = (name: string) => `${runPrefix()}${name}@resend.dev`

/** A confirmed user created through the admin API; the handle_new_user trigger makes the profile. */
export async function createConfirmedUser({
  role,
  displayName,
  timezone = 'Asia/Yangon',
  locale = 'en',
}: {
  role: Role
  displayName: string
  timezone?: string
  locale?: 'en' | 'my' | 'ja'
}): Promise<TestUser> {
  const email = testEmail(`${role}-${randomUUID().slice(0, 8)}`)
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, display_name: displayName, timezone, locale },
  })
  if (error || !data.user) throw error ?? new Error('createUser returned no user')
  return { id: data.user.id, email, password: TEST_PASSWORD, role, displayName }
}

/** Signs in through the real form (01-Main / 13-AdminSignin) and waits for the role home. */
export async function signIn(page: Page, user: TestUser) {
  await page.goto(`/sign-in?role=${user.role}&email=${encodeURIComponent(user.email)}`)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page
    .getByRole('button', {
      name: user.role === 'admin' ? 'Sign in as Admin' : 'Sign in as Student',
    })
    .click()
  await expect(page).toHaveURL(user.role === 'admin' ? /\/a\// : /\/(s\/|join)/)
}

/** A second signed-in browser with the test's own viewport, e.g. the Admin beside the student. */
export async function signedInPage(browser: Browser, testInfo: TestInfo, user: TestUser) {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, baseURL } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
  })
  const page = await context.newPage()
  await signIn(page, user)
  return page
}
