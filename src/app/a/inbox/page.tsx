import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Screen } from '@/components/layout/screen'
import { SubPageHeader } from '@/components/layout/sub-page-header'
import { SeedInbox } from '@/features/notifications/components/with-notifications'

// The Admin's inbox (spec 006 US1; contracts/ui-routes.md › Inbox), full screen from the Students bell.
export default async function AdminInboxPage() {
  const [t, tc] = await Promise.all([getTranslations('inbox'), getTranslations('common')])
  return (
    <Screen>
      <SubPageHeader title={t('title')} backHref="/a/students" backLabel={tc('back')} />
      <Suspense fallback={<PageSkeleton header={false} />}>
        <SeedInbox />
      </Suspense>
    </Screen>
  )
}
