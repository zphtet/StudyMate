import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthShell } from '@/components/layout/auth-shell'
import { SignUpForm } from '@/features/auth/components/sign-up-form'

export const metadata: Metadata = { title: 'Create account' }

export default async function SignUpPage() {
  const t = await getTranslations('common')
  return (
    <AuthShell backHref="/sign-in" backLabel={t('back')}>
      <SignUpForm />
    </AuthShell>
  )
}
