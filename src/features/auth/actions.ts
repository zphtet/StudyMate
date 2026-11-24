'use server'

import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js'
import { z } from 'zod'
import { action, fail, publicAction } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import { createServerClient } from '@/lib/supabase/server'
import { requireUser } from '@/server/auth/guards'
import { changePasswordSchema } from '@/features/profile/schemas'
import { checkVerify, decideSend, recordFailedAttempt } from './limits'
import { clearLimit, getLimit, saveLimit } from './limits-repo'
import { toAppearance } from '@/lib/appearance'
import { setPreferenceCookies } from './preferences'
import {
  emailOnlySchema,
  setLocaleSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
  type Role,
} from './schemas'

// Auth actions (contracts/server-actions.md). The public ones run before a user exists, so they
// can't call a guard (plan.md › Complexity Tracking). They touch only Supabase Auth, the
// auth_email_limits row for the submitted email, and — after the user has proved who they are
// (correct password or code) — that user's own profile. They never reveal whether an account exists.

const CODE_LIFETIME_SECONDS = 60 * 60
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const roleHome = (role: Role) => (role === 'admin' ? '/a/students' : '/s/today')

/** Send (or resend) the sign-up confirmation code within the FR-011 limits. */
async function sendSignupCode(email: string, send: () => Promise<{ error: AuthError | null }>) {
  const decision = decideSend(await getLimit(email, 'signup'), new Date())
  if (!decision.ok) {
    if (decision.error === 'cooldown') fail('cooldown', { seconds: decision.seconds })
    fail('too_many_sends', { minutes: decision.minutes })
  }
  const { error } = await send()
  if (error) fail(...emailError(error))
  await saveLimit(email, 'signup', decision.next)
}

/** Map Supabase Auth errors from sending a code to our error codes (never reveals accounts). */
function emailError(error: AuthError): [string, Record<string, number>?] {
  if (error.code === 'weak_password') return ['weak_password']
  if (error.code === 'over_email_send_rate_limit') {
    // Per-address cooldown says "…after N seconds"; the project-wide hourly limit doesn't.
    const seconds = Number(/after (\d+) seconds?/i.exec(error.message)?.[1])
    return seconds ? ['cooldown', { seconds }] : ['email_rate_limited']
  }
  // Supabase couldn't hand the email to the mail server (SMTP down or misconfigured: 5xx/timeout).
  if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
    console.error('[auth] sending a code failed', error.status, error.code, error.message)
    return ['email_failed']
  }
  console.error('[auth] unexpected error sending a code', error.status, error.code, error.message)
  return ['unexpected']
}

export const signUp = publicAction(signUpSchema, async (input) => {
  const supabase = await createServerClient()
  await sendSignupCode(input.email, () =>
    // An email that already has a confirmed account gets a normal-looking reply and no code
    // (Supabase hides it), so nobody can learn which emails are registered (spec edge cases).
    supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Read once by handle_new_user; the role is locked afterwards (research R14).
        data: {
          role: input.role,
          display_name: input.displayName,
          timezone: input.timezone,
          locale: input.locale,
        },
        emailRedirectTo: `${siteUrl()}/auth/callback`,
      },
    }),
  )
  await setPreferenceCookies({ locale: input.locale, timezone: input.timezone })
  return { email: input.email, sentAt: Date.now() }
})

export const resendSignupCode = publicAction(emailOnlySchema, async ({ email }) => {
  const supabase = await createServerClient()
  await sendSignupCode(email, () =>
    supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    }),
  )
  return { sentAt: Date.now(), cooldownSeconds: 60 }
})

export const verifyEmailCode = publicAction(verifyEmailSchema, async ({ email, code }) => {
  const row = await getLimit(email, 'signup')
  if (!checkVerify(row).ok) fail('too_many_attempts')

  const supabase = await createServerClient()
  // `email` is the current type for sign-up codes (`signup` is deprecated), research R4.
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error || !data.user) {
    // Supabase answers "expired or invalid" for both; our send time tells them apart.
    const sentAt = row?.lastSentAt?.getTime()
    if (sentAt && Date.now() - sentAt > CODE_LIFETIME_SECONDS * 1000) fail('code_expired')
    const { next, attemptsLeft } = recordFailedAttempt(row, new Date())
    await saveLimit(email, 'signup', next)
    if (attemptsLeft === 0) fail('too_many_attempts')
    fail('wrong_code', { attemptsLeft })
  }

  await clearLimit(email, 'signup')
  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: {
      role: true,
      locale: true,
      timezone: true,
      colorMode: true,
      themeId: true,
      fontId: true,
      fontScale: true,
    },
  })
  if (!profile) fail('unexpected')
  await setPreferenceCookies({ ...profile, appearance: toAppearance(profile) })
  return { home: profile.role === 'admin' ? '/a/welcome' : '/join' }
})

export const signIn = publicAction(signInSchema, async ({ role, email, password }) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      // Right password, unconfirmed email: send a new code (within limits) and go to Confirm.
      try {
        await sendSignupCode(email, () => supabase.auth.resend({ type: 'signup', email }))
      } catch {
        // Cooldown or too many sends: the Confirm screen shows the limit when they resend.
      }
      return { verify: true as const, email, sentAt: Date.now() }
    }
    fail('invalid_credentials')
  }

  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: {
      role: true,
      locale: true,
      timezone: true,
      colorMode: true,
      themeId: true,
      fontId: true,
      fontScale: true,
    },
  })
  if (!profile) fail('unexpected')
  await setPreferenceCookies({ ...profile, appearance: toAppearance(profile) })
  // Never changes the stored role (FR-002); a different pick only changes the message.
  return {
    verify: false as const,
    home: roleHome(profile.role),
    roleMismatch: profile.role !== role ? profile.role : null,
  }
})

/**
 * Ends only the caller's own session; works even if their profile is already gone. With this
 * device's push endpoint, the device stops getting the caller's notifications first (spec 006 FR-014;
 * research R8).
 */
export const signOut = action(z.object({ endpoint: z.url().optional() }), async ({ endpoint }) => {
  const me = await requireUser().catch(() => null)
  if (me && endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } })
  }
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  return {}
})

/** Change password (research R13): re-check the current password, then set the new one. */
export const changePassword = action(
  changePasswordSchema,
  async ({ currentPassword, newPassword }) => {
    const me = await requireUser()
    const supabase = await createServerClient()
    const { error: wrong } = await supabase.auth.signInWithPassword({
      email: me.email,
      password: currentPassword,
    })
    if (wrong) fail('wrong_password')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      if (error.code === 'weak_password') fail('weak_password')
      if (error.code === 'same_password') fail('same_password')
      throw error
    }
    return {}
  },
)

export const setLocale = publicAction(setLocaleSchema, async ({ locale }) => {
  await setPreferenceCookies({ locale })
  // Signed in: keep profiles.locale in sync (guarded; signed-out visitors just get the cookie).
  const me = await requireUser().catch(() => null)
  if (me) await prisma.profile.update({ where: { id: me.id }, data: { locale } })
  return {}
})
