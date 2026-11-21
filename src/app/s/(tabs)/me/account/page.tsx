import { getTranslations } from 'next-intl/server'
import { SubPageHeader } from '@/components/layout/sub-page-header'
import { AccountView } from '@/features/profile/components/account-view'
import { WithMe } from '@/features/profile/components/with-me'

export default async function StudentAccountPage() {
  const [t, tc] = await Promise.all([getTranslations('account'), getTranslations('common')])
  return (
    <>
      <SubPageHeader title={t('title')} backHref="/s/me" backLabel={tc('back')} />
      <WithMe>
        <AccountView />
      </WithMe>
    </>
  )
}
