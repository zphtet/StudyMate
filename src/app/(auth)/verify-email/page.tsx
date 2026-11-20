import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthShell } from '@/components/layout/auth-shell'
import { VerifyEmailForm } from '@/features/auth/components/verify-email-form'

export const metadata: Metadata = { title: 'Confirm your email' }

export default async function VerifyEmailPage() {
  const t = await getTranslations('common')
  return (
    <AuthShell backHref="/sign-up" backLabel={t('back')} showLanguage={false}>
      <VerifyEmailForm />
    </AuthShell>
  )
}
