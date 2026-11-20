import type { Metadata } from 'next'
import { AuthShell } from '@/components/layout/auth-shell'
import { SignInForm } from '@/features/auth/components/sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    <AuthShell>
      <SignInForm />
    </AuthShell>
  )
}
