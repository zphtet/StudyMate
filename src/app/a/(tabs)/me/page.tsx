import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/page-header'
import { DeviceRemindersRow } from '@/features/notifications/components/device-reminders-row'
import { MeView } from '@/features/profile/components/me-view'
import { WithMe } from '@/features/profile/components/with-me'

export default async function AdminMePage() {
  const t = await getTranslations('me')
  return (
    <>
      <PageHeader title={t('title')} />
      <WithMe>
        <MeView reminderRows={<DeviceRemindersRow />} />
      </WithMe>
    </>
  )
}
