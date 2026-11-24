import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthShell } from '@/components/layout/auth-shell'
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form'

export const metadata: Metadata = { title: 'Set a new password' }

export default async function ResetPasswordPage() {
  const t = await getTranslations('common')
  return (
    <AuthShell backHref="/forgot-password" backLabel={t('back')} showLanguage={false}>
      <ResetPasswordForm />
    </AuthShell>
  )
}
