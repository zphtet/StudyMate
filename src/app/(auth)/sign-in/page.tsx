import type { Metadata } from 'next'
import { AuthShell } from '@/components/layout/auth-shell'
import { AppMark } from '@/components/shared/app-mark'
import { SignInForm } from '@/features/auth/components/sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    // The logo shares the top row with the language menu (owner's request, 2026-11-24; 01-Main
    // stacks them).
    <AuthShell leading={<AppMark />}>
      <SignInForm />
    </AuthShell>
  )
}
