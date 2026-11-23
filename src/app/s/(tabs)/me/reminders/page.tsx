import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { SubPageHeader } from '@/components/layout/sub-page-header'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { SeedMyReminders } from '@/features/notifications/components/with-notifications'

// My reminders (spec 006 US5; contracts/ui-routes.md › Me): below Me, like Appearance. The /s
// layout already checked that this is a student.
export default async function MyRemindersPage() {
  const [t, tc] = await Promise.all([getTranslations('myReminders'), getTranslations('common')])
  return (
    <>
      <SubPageHeader title={t('title')} backHref="/s/me" backLabel={tc('back')} />
      <Suspense fallback={<PageSkeleton header={false} />}>
        <SeedMyReminders />
      </Suspense>
    </>
  )
}
