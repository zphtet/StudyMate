import { getTranslations } from 'next-intl/server'
import { SubPageHeader } from '@/components/layout/sub-page-header'
import { AppearanceView } from '@/features/profile/components/appearance-view'
import { WithMe } from '@/features/profile/components/with-me'

export default async function StudentAppearancePage() {
  const [t, tc] = await Promise.all([getTranslations('appearance'), getTranslations('common')])
  return (
    <>
      <SubPageHeader title={t('title')} backHref="/s/me" backLabel={tc('back')} />
      <WithMe>
        <AppearanceView />
      </WithMe>
    </>
  )
}
