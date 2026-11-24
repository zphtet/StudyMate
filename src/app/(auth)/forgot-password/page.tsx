import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthShell } from '@/components/layout/auth-shell'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'

export const metadata: Metadata = { title: 'Forgot your password?' }

export default async function ForgotPasswordPage() {
  const t = await getTranslations('common')
  return (
    <AuthShell backHref="/sign-in" backLabel={t('back')}>
      <ForgotPasswordForm />
    </AuthShell>
  )
}
